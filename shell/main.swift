// aki — native macOS shell.
//
// Wraps the compiled aki server in a real NSWindow using the SYSTEM WebKit:
// no Electron (no second JS runtime), no Rust toolchain. The whole shell is
// ~100 KB because WKWebView is already on every Mac.
//
// It spawns Contents/MacOS/server on a free port, waits for it to answer, then
// points a WKWebView at it — and kills the child on quit, which is the thing a
// faceless .app cannot do.
//
// Build: swiftc -O -o Aki shell/main.swift -framework Cocoa -framework WebKit

import Cocoa
import Darwin
import WebKit

/// Ask the kernel for an unused port, so the app never collides with a dev
/// server (or a second copy of itself) on a fixed one.
func findFreePort() -> UInt16 {
  let fd = socket(AF_INET, SOCK_STREAM, 0)
  defer { close(fd) }
  var addr = sockaddr_in()
  addr.sin_family = sa_family_t(AF_INET)
  addr.sin_addr.s_addr = inet_addr("127.0.0.1")
  addr.sin_port = 0
  _ = withUnsafePointer(to: &addr) {
    bind(fd, UnsafeRawPointer($0).assumingMemoryBound(to: sockaddr.self),
         socklen_t(MemoryLayout<sockaddr_in>.size))
  }
  var bound = sockaddr_in()
  var len = socklen_t(MemoryLayout<sockaddr_in>.size)
  _ = withUnsafeMutablePointer(to: &bound) {
    getsockname(fd, UnsafeMutableRawPointer($0).assumingMemoryBound(to: sockaddr.self), &len)
  }
  return UInt16(bigEndian: bound.sin_port)
}

/// Settings, resolved last-wins:
///   1. the defaults below
///   2. Info.plist  — build time; `scripts/package-mac.sh` writes these from env
///   3. UserDefaults — run time; `defaults write <bundle-id> WindowWidth 1400`
///
/// So a developer can retune a built app without rebuilding it, and a release
/// build can ship different defaults without touching Swift.
enum Config {
  private static func plist(_ key: String) -> Any? {
    Bundle.main.object(forInfoDictionaryKey: key)
  }

  static func int(_ key: String, _ fallback: Int) -> Int {
    if UserDefaults.standard.object(forKey: key) != nil {
      return UserDefaults.standard.integer(forKey: key)
    }
    if let v = plist(key) as? Int { return v }
    if let s = plist(key) as? String, let v = Int(s) { return v }   // plists from sed are strings
    return fallback
  }

  static func bool(_ key: String, _ fallback: Bool) -> Bool {
    if UserDefaults.standard.object(forKey: key) != nil {
      return UserDefaults.standard.bool(forKey: key)
    }
    if let v = plist(key) as? Bool { return v }
    if let s = plist(key) as? String { return ["1", "true", "YES"].contains(s) }
    return fallback
  }

  static func string(_ key: String, _ fallback: String) -> String {
    UserDefaults.standard.string(forKey: key) ?? (plist(key) as? String) ?? fallback
  }

  // window
  static var windowWidth: Int      { int("WindowWidth", 1000) }
  static var windowHeight: Int     { int("WindowHeight", 900) }
  static var windowMinWidth: Int   { int("WindowMinWidth", 640) }
  static var windowMinHeight: Int  { int("WindowMinHeight", 480) }
  static var restoreFrame: Bool    { bool("RestoreWindowFrame", true) }
  static var startFullScreen: Bool { bool("StartFullScreen", false) }
  static var title: String         { string("WindowTitle", "") }

  // server
  /// 0 = ask the kernel for a free one (the default, and what avoids collisions)
  static var serverPort: Int       { int("ServerPort", 0) }
  static var startupTimeout: Int   { int("StartupTimeoutSeconds", 20) }

  // development
  /// Right-click → Inspect Element inside the packaged app. Ship with
  /// `DevTools=false` in Info.plist for a release build.
  static var devTools: Bool        { bool("DevTools", true) }
  static var openExternalLinks: Bool { bool("OpenExternalLinksInBrowser", true) }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  var window: NSWindow!
  var web: WKWebView!
  var server: Process?
  var signalSources: [DispatchSourceSignal] = []
  let port: UInt16 = Config.serverPort > 0 ? UInt16(Config.serverPort) : findFreePort()
  var appName: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "aki"
  }
  var windowTitle: String { Config.title.isEmpty ? appName : Config.title }
  var url: URL { URL(string: "http://127.0.0.1:\(port)/")! }

  func applicationDidFinishLaunching(_: Notification) {
    buildMenu()
    buildWindow()
    installSignalHandlers()
    startServer()
  }

  /// applicationWillTerminate only runs on a Cocoa quit (Cmd-Q, the menu).
  /// A plain `kill` killed the shell and ORPHANED the server, which then sat
  /// holding the database with no window attached. Catch the signals too.
  private func installSignalHandlers() {
    for sig in [SIGTERM, SIGINT, SIGHUP] {
      signal(sig, SIG_IGN)   // ignore the default action; the source handles it
      let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
      src.setEventHandler { [weak self] in
        self?.stopServer()
        exit(0)
      }
      src.resume()
      signalSources.append(src)
    }
  }

  // MARK: window

  private func buildWindow() {
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: Config.windowWidth, height: Config.windowHeight),
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered, defer: false)
    window.title = windowTitle
    window.minSize = NSSize(width: Config.windowMinWidth, height: Config.windowMinHeight)
    window.center()
    // macOS persists size + position under this name, so a returning user gets
    // the window where they left it. RestoreWindowFrame=false to always open
    // at the configured size instead.
    if Config.restoreFrame { window.setFrameAutosaveName("main") }

    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    web = WKWebView(frame: window.contentView!.bounds, configuration: config)
    web.autoresizingMask = [.width, .height]
    web.navigationDelegate = self
    web.allowsBackForwardNavigationGestures = true
    // isInspectable is 13.3+, but Info.plist declares a 13.0 minimum — without
    // this guard the app simply fails to compile for its own stated floor.
    if Config.devTools, #available(macOS 13.3, *) { web.isInspectable = true }
    window.contentView!.addSubview(web)
    window.makeKeyAndOrderFront(nil)
    if Config.startFullScreen { window.toggleFullScreen(nil) }
  }

  // MARK: the server child

  private func startServer() {
    guard let exe = Bundle.main.url(forAuxiliaryExecutable: "server") else {
      fail("Bundled server executable is missing from Contents/MacOS/server.")
      return
    }
    let p = Process()
    p.executableURL = exe
    var env = ProcessInfo.processInfo.environment
    env["PORT"] = String(port)
    env["AKI_NO_OPEN"] = "1"          // the shell IS the UI; don't open a browser too
    env["AKI_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
    p.environment = env
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    do { try p.run() } catch {
      fail("Could not start the server: \(error.localizedDescription)")
      return
    }
    server = p
    waitThenLoad()
  }

  /// Poll until the server answers, then load. Without this the WebView races
  /// the child process and shows a connection error on a cold start.
  private func waitThenLoad() {
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      let deadline = Date().addingTimeInterval(TimeInterval(Config.startupTimeout))
      var req = URLRequest(url: self.url)
      req.timeoutInterval = 1
      while Date() < deadline {
        if self.server?.isRunning == false { break }
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: req) { _, resp, _ in
          ok = (resp as? HTTPURLResponse)?.statusCode ?? 0 > 0
          sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 2)
        if ok {
          DispatchQueue.main.async { self.web.load(URLRequest(url: self.url)) }
          return
        }
        usleep(150_000)
      }
      DispatchQueue.main.async { self.fail("The server did not start in time.") }
    }
  }

  private func fail(_ message: String) {
    let a = NSAlert()
    a.messageText = "\(appName) could not start"
    a.informativeText = message
    a.alertStyle = .critical
    a.addButton(withTitle: "Quit")
    a.runModal()
    NSApp.terminate(nil)
  }

  // MARK: menu — this is why ⌘Q works here and not in a faceless .app

  private func buildMenu() {
    let main = NSMenu()

    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
    appMenu.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    main.addItem(appItem)

    // WKWebView needs a real Edit menu for ⌘C / ⌘V / ⌘A to work at all.
    let editItem = NSMenuItem()
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    edit.addItem(.separator())
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit
    main.addItem(editItem)

    NSApp.mainMenu = main
  }

  @objc func reload() { web.reload() }

  // MARK: lifecycle

  func applicationShouldTerminateAfterLastWindowClosed(_: NSApplication) -> Bool { true }

  /// Kill the child, or the server outlives the window and the next launch
  /// leaves an orphan holding the database. Idempotent — called from both the
  /// Cocoa quit path and the signal handlers.
  func stopServer() {
    guard let p = server, p.isRunning else { return }
    p.terminate()
    let deadline = Date().addingTimeInterval(3)
    while p.isRunning && Date() < deadline { usleep(50_000) }
    if p.isRunning { kill(p.processIdentifier, SIGKILL) }
  }

  func applicationWillTerminate(_: Notification) { stopServer() }

  /// Open target=_blank and external links in the real browser, not in here.
  func webView(_ web: WKWebView, decidePolicyFor nav: WKNavigationAction,
               decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if Config.openExternalLinks,
       let u = nav.request.url, u.host != "127.0.0.1", u.host != "localhost",
       u.scheme == "http" || u.scheme == "https" {
      NSWorkspace.shared.open(u)
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()

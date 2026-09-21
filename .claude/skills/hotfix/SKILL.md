---
name: hotfix
description: Pull a fix or improvement from aki (the starter this app was built from) into this app. Use when the user says "pull that from aki", "aki fixed this", "hotfix from aki", "update from the starter", or when a bug here turns out to be already fixed upstream in aki. Not for merging; apps are snapshots.
---

# Pulling an aki change into this app

This app was cut from aki by `rename`, which rewrote the name and the env prefix in a dozen files. So aki's history is not this app's history and a git merge is the wrong tool. `bun run hotfix` is the right one: it takes aki's patch for each changed file, rewrites it with this app's identity using the same rules `rename` used, and applies it with `git apply`.

## 1. See what aki changed

```bash
git status                # clean tree first; a bad hotfix should be one `git checkout .` away
bun run hotfix            # dry run: lists what would apply, what's current, what needs a hand
```

It reads the base aki commit from the **Base:** line in `UPSTREAM.md`, clones aki to a temp dir, and diffs. A local aki checkout is faster: `bun run hotfix --repo ../aki`.

The report has four buckets. **Would apply cleanly** is aki's change, rewritten, fitting this file. **Already current** means this app has it. **New in aki** is a file this app lacks; it is never added unless named, because an app that dropped the `widgets` example must not get it back. **Needs a look by hand** means this app edited the same lines; aki's version rewritten for this app is written to the temp dir path shown.

## 2. Decide, file by file

Take a change if it is a fix, a convention, tooling, or a trap: the same test as porting the other way. Leave it if this app deliberately diverged there. Domain files (`db/schema.ts`, `app/routes/*` other than the reference resource, `styles/tokens.css`) are usually this app's own and rarely want aki's version; `README.md`, `CLAUDE.md` and `UPSTREAM.md` are never touched.

## 3. Apply

```bash
bun run hotfix --apply                        # everything in the clean bucket
bun run hotfix --apply shell/main.swift       # or only these files
bun run hotfix --apply app/routes/widgets.tsx # naming a "new in aki" file adds it
```

Manual files: open aki's rewritten copy from the temp dir beside this app's file and merge by hand. Then set the **Base:** line in `UPSTREAM.md` to aki's commit yourself; the tool only bumps it when nothing was left for a hand.

## 4. The gate

```bash
bun run check    # biome, regenerate COMPONENTS.md, every test
```

Commit with aki's commit sha in the message, so the next person can find where the change came from.

## No base, or a base aki no longer has

If `UPSTREAM.md` has no **Base:** line (the app predates it) or aki's history was rewritten under it, the tool compares whole files instead: aki's version rewritten for this app against the file here.

```bash
bun run hotfix                                     # lists files that differ
bun run hotfix --show app/server.ts | diff app/server.ts -   # look at one
bun run hotfix --apply app/server.ts               # take aki's version of it
```

In this mode `--apply` takes only the files you name and overwrites them, so look first. Once you have taken what you want, the Base line is set to aki's current commit and later hotfixes are proper diffs again.

## Where the rewrite rules live

`scripts/lib/identity.ts`. `rename` and `hotfix` both use it, so a place that spells the app's name is added there once and both tools learn it. If a hotfix lands with `aki` or `AKI_` still in it, that file is missing from the rules.

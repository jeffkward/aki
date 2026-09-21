import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** True in a `bun build --compile` bundle (baked in with --define). */
export const packaged = process.env.AKI_PACKAGED === "1";

/** Where the app's own data lives.
 *  Dev: the repo. Packaged: ~/Library/Application Support/aki — a .app bundle
 *  is read-only and its working directory is "/", so nothing may be written
 *  beside the binary. */
export function dataDir(): string {
  if (!packaged) return process.cwd();
  const dir = join(homedir(), "Library", "Application Support", "aki");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  if (process.env.AKI_DB) return process.env.AKI_DB;
  return packaged ? join(dataDir(), "aki.db") : "./aki.db";
}

/** Assets embedded by `compile.assets` land under import.meta.dir. */
export function assetPath(rel: string): string {
  return packaged ? join(import.meta.dir, rel) : join(process.cwd(), rel);
}

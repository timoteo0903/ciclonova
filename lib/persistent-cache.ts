import { promises as fs } from "node:fs";
import path from "node:path";

export interface PersistedCacheEntry<T> {
  value: T;
  expiresAt: number;
  savedAt: number;
}

const CACHE_ROOT = process.env.CAFCI_CACHE_DIR
  ? path.resolve(process.env.CAFCI_CACHE_DIR)
  : path.join(process.cwd(), ".cache", "cafci");

function keyToFilename(key: string): string {
  const normalized = key.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return `${normalized || "cache"}.json`;
}

function keyToPath(key: string): string {
  return path.join(CACHE_ROOT, keyToFilename(key));
}

export async function readPersistedCache<T>(key: string): Promise<PersistedCacheEntry<T> | null> {
  const filePath = keyToPath(key);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PersistedCacheEntry<T>;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("expiresAt" in parsed) || !("value" in parsed)) return null;
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    return null;
  }
}

export async function writePersistedCache<T>(key: string, entry: PersistedCacheEntry<T>): Promise<void> {
  const filePath = keyToPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entry), "utf8");
}

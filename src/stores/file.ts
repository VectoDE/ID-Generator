import { randomInt, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigurationError, IdGeneratorError, assertInteger } from '../errors.js';
import type { SequenceStore, SequenceStoreOptions } from './types.js';

export interface FileSequenceStoreOptions extends SequenceStoreOptions {
  /** JSON file for the counters; created on first use. */
  path: string;
  /**
   * How long to wait for the lock held by another process. Default 15000 ms, longer than `staleLockMs`, so a lock
   * left by a crashed process is cleaned up instead of timing out.
   */
  lockTimeoutMs?: number;
  /** A lock older than this is treated as left behind by a crashed process and removed. Default 10000 ms. */
  staleLockMs?: number;
}

interface StoreFile {
  version: 1;
  counters: Record<string, number>;
}

// A Map in memory, so scope names like "__proto__" are ordinary keys.
type Counters = Map<string, number>;

const RETRYABLE_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES']);
// On Windows a lock file that another process is deleting cannot be opened for a moment; that means "locked".
const BUSY_LOCK = process.platform === 'win32' ? new Set(['EEXIST', 'EPERM', 'EBUSY', 'EACCES']) : new Set(['EEXIST']);

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;

const isStoreFile = (value: unknown): value is StoreFile => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { version, counters } = value as Record<string, unknown>;
  return (
    version === 1 &&
    typeof counters === 'object' &&
    counters !== null &&
    Object.values(counters).every((count) => Number.isSafeInteger(count) && (count as number) >= 0)
  );
};

// Contents of a file, or undefined when it does not exist.
const readIfExists = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

/**
 * Counters in a JSON file, so numbers continue after a restart. Several processes may share the file: every change
 * holds a lock file and replaces the file atomically (write and flush a temporary file, then rename).
 *
 * Each lock carries a random token. A process only removes a lock that still has its token, and checks the token
 * again right before it writes, so a process that stalled past `staleLockMs` fails with `STORE_LOCKED` instead of
 * overwriting newer counters.
 */
export class FileSequenceStore implements SequenceStore {
  readonly path: string;
  readonly #lockPath: string;
  readonly #start: number;
  readonly #lockTimeoutMs: number;
  readonly #staleLockMs: number;
  // Calls from the same process wait their turn here instead of competing for the lock file.
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: FileSequenceStoreOptions) {
    // Checked at runtime as well, for callers without TypeScript.
    const path: unknown = (options as Partial<FileSequenceStoreOptions> | undefined)?.path;
    if (typeof path !== 'string' || path.length === 0) {
      throw new ConfigurationError('INVALID_OPTION', 'FileSequenceStore needs a file path.', { option: 'path' });
    }
    this.path = resolve(options.path);
    this.#lockPath = `${this.path}.lock`;
    this.#start = assertInteger('start', options.start ?? 1, 0, Number.MAX_SAFE_INTEGER);
    this.#lockTimeoutMs = assertInteger('lockTimeoutMs', options.lockTimeoutMs ?? 15_000, 0, 600_000);
    this.#staleLockMs = assertInteger('staleLockMs', options.staleLockMs ?? 10_000, 100, 3_600_000);
  }

  async next(scope: string): Promise<number> {
    return this.#exclusive(async (token) => {
      const counters = await this.#read();
      const last = counters.get(scope);
      const value = last === undefined ? this.#start : last + 1;
      if (value > Number.MAX_SAFE_INTEGER) {
        throw new IdGeneratorError('SEQUENCE_OVERFLOW', `The sequence "${scope}" reached Number.MAX_SAFE_INTEGER.`);
      }
      counters.set(scope, value);
      await this.#write(counters, token);
      return value;
    });
  }

  async peek(scope: string): Promise<number> {
    const last = (await this.#read()).get(scope);
    return last === undefined ? this.#start : last + 1;
  }

  async reset(scope?: string): Promise<void> {
    await this.#exclusive(async (token) => {
      const counters = await this.#read();
      if (scope === undefined) {
        counters.clear();
      } else {
        counters.delete(scope);
      }
      await this.#write(counters, token);
    });
  }

  /** All counters as stored in the file. */
  async snapshot(): Promise<Record<string, number>> {
    return Object.fromEntries(await this.#read());
  }

  #exclusive<T>(task: (token: string) => Promise<T>): Promise<T> {
    const run = this.#queue.then(async () => {
      const token = await this.#acquireLock(Date.now() + this.#lockTimeoutMs);
      try {
        return await task(token);
      } finally {
        await this.#releaseLock(token);
      }
    });
    // A failed call must not block the ones after it.
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #acquireLock(deadline: number): Promise<string> {
    await mkdir(dirname(this.path), { recursive: true });
    const token = `${process.pid}:${randomUUID()}`;
    try {
      const handle = await open(this.#lockPath, 'wx');
      try {
        await handle.writeFile(token);
      } finally {
        await handle.close();
      }
      return token;
    } catch (error) {
      if (!BUSY_LOCK.has(errorCode(error) ?? '')) {
        throw error;
      }
    }
    if (await this.#removeStaleLock()) {
      return this.#acquireLock(deadline);
    }
    if (Date.now() >= deadline) {
      throw new IdGeneratorError('STORE_LOCKED', `Timed out waiting for the lock on ${this.path}.`, {
        lock: this.#lockPath,
      });
    }
    // Random wait, so processes that collided do not retry in lockstep.
    await sleep(randomInt(10, 50));
    return this.#acquireLock(deadline);
  }

  // Removes the lock only while it still carries this token; a lock taken over by another process stays.
  async #releaseLock(token: string): Promise<void> {
    if ((await readIfExists(this.#lockPath)) === token) {
      await rm(this.#lockPath, { force: true });
    }
  }

  // Returns true when the caller should try to take the lock right away.
  async #removeStaleLock(): Promise<boolean> {
    let mtimeMs: number;
    let owner: string | undefined;
    try {
      ({ mtimeMs } = await stat(this.#lockPath));
      owner = await readIfExists(this.#lockPath);
    } catch (error) {
      // The lock vanished between the failed open and stat: just try again.
      if (errorCode(error) === 'ENOENT') {
        return true;
      }
      throw error;
    }
    if (owner === undefined) {
      return true;
    }
    if (Date.now() - mtimeMs <= this.#staleLockMs) {
      return false;
    }
    // Rename first: only one waiter can move a given lock away. If what it moved is not the lock it judged stale
    // (another waiter already replaced it with a fresh one), it puts that lock back.
    const moved = `${this.#lockPath}.${randomUUID()}.stale`;
    try {
      await rename(this.#lockPath, moved);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return true;
      }
      throw error;
    }
    const movedOwner = await readIfExists(moved);
    if (movedOwner !== owner) {
      await this.#restoreLock(moved);
      return false;
    }
    await rm(moved, { force: true });
    return true;
  }

  // Puts a lock moved away by mistake back unless a new one exists; its owner notices a lost lock before writing.
  async #restoreLock(moved: string): Promise<void> {
    try {
      await link(moved, this.#lockPath);
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') {
        throw error;
      }
    } finally {
      await rm(moved, { force: true });
    }
  }

  async #read(): Promise<Counters> {
    const text = await readIfExists(this.path);
    if (text === undefined) {
      return new Map();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (!isStoreFile(parsed)) {
      throw new IdGeneratorError('STORE_CORRUPT', `${this.path} is not a valid sequence file.`, { path: this.path });
    }
    return new Map(Object.entries(parsed.counters));
  }

  async #write(counters: Counters, token: string): Promise<void> {
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    // Object.fromEntries defines own properties, so "__proto__" is stored as a normal key.
    const data: StoreFile = { version: 1, counters: Object.fromEntries(counters) };
    try {
      const handle = await open(temporary, 'w');
      try {
        await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
        // Flushed before the rename, so a power loss leaves the old or the new file, never an empty one.
        await handle.sync();
      } finally {
        await handle.close();
      }
      if ((await readIfExists(this.#lockPath)) !== token) {
        throw new IdGeneratorError(
          'STORE_LOCKED',
          `Lost the lock on ${this.path} while updating it; nothing was saved.`,
          {
            lock: this.#lockPath,
          }
        );
      }
      await this.#replace(temporary, 5);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  // Windows refuses a rename while another process reads the target; such errors pass after a short wait.
  async #replace(temporary: string, attemptsLeft: number): Promise<void> {
    try {
      await rename(temporary, this.path);
    } catch (error) {
      if (attemptsLeft <= 1 || !RETRYABLE_RENAME.has(errorCode(error) ?? '')) {
        throw error;
      }
      await sleep(20);
      await this.#replace(temporary, attemptsLeft - 1);
    }
  }
}

/**
 * Where sequence counters live. Implement this to keep counters in Redis, a database or anywhere else; every method
 * may return a value or a promise.
 *
 * `next` must be atomic: two concurrent calls for the same scope never return the same number.
 */
export interface SequenceStore {
  /** Moves the counter of `scope` forward and returns the new value. */
  next(scope: string): number | Promise<number>;
  /** Value the next call to `next(scope)` would return, without changing anything. */
  peek(scope: string): number | Promise<number>;
  /** Resets one scope, or all scopes when called without an argument. */
  reset(scope?: string): void | Promise<void>;
}

export interface SequenceStoreOptions {
  /** First value of every counter. Default 1. */
  start?: number;
}

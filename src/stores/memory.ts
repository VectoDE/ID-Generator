// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { IdGeneratorError, assertInteger } from '../errors.js';
import type { SequenceStore, SequenceStoreOptions } from './types.js';

/** Counters in memory. Fast and synchronous; they start over when the process restarts. */
export class MemorySequenceStore implements SequenceStore {
  readonly #start: number;
  readonly #counters = new Map<string, number>();

  constructor(options: SequenceStoreOptions = {}) {
    this.#start = assertInteger('start', options.start ?? 1, 0, Number.MAX_SAFE_INTEGER);
  }

  next(scope: string): number {
    const value = this.peek(scope);
    if (value > Number.MAX_SAFE_INTEGER) {
      throw new IdGeneratorError('SEQUENCE_OVERFLOW', `The sequence "${scope}" reached Number.MAX_SAFE_INTEGER.`);
    }
    this.#counters.set(scope, value);
    return value;
  }

  peek(scope: string): number {
    const last = this.#counters.get(scope);
    return last === undefined ? this.#start : last + 1;
  }

  reset(scope?: string): void {
    if (scope === undefined) {
      this.#counters.clear();
    } else {
      this.#counters.delete(scope);
    }
  }

  /** Current values as a plain object, e.g. for saving them somewhere. */
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.#counters);
  }
}

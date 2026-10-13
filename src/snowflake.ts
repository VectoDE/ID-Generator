// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { ConfigurationError, IdGeneratorError, ValidationError, assertInteger } from './errors.js';

/** Default epoch: 2024-01-01T00:00:00Z. 41 bits of milliseconds last until 2093. */
export const DEFAULT_SNOWFLAKE_EPOCH = Date.UTC(2024, 0, 1);

const TIMESTAMP_BITS = 41n;
const MAX_TIMESTAMP_OFFSET = (1n << TIMESTAMP_BITS) - 1n;

export interface SnowflakeLayout {
  /** Start of time for the ID, in Unix milliseconds. Default 2024-01-01. Must stay the same for all generators. */
  epoch?: number;
  /** Bits for the worker (machine or process) number. Default 10, so 1024 workers. */
  workerBits?: number;
  /** Bits for the per-millisecond sequence. Default 12, so 4096 IDs per millisecond and worker. */
  sequenceBits?: number;
}

export interface SnowflakeOptions extends SnowflakeLayout {
  /** This generator's worker number. Two generators running at the same time need different numbers. */
  workerId?: number;
  /** Clock in milliseconds since the Unix epoch. Defaults to `Date.now`. */
  now?: () => number;
}

export interface SnowflakeParts {
  timestamp: Date;
  workerId: number;
  sequence: number;
}

export interface SnowflakeGenerator {
  /** Next ID as a decimal string (safe for JSON and JavaScript numbers). */
  next(): string;
  /** Next ID as a BigInt. */
  nextBigInt(): bigint;
  /** Splits an ID made with the same layout into time, worker and sequence. */
  parse(id: string | bigint): SnowflakeParts;
}

const resolveLayout = (layout: SnowflakeLayout) => {
  const epoch = layout.epoch ?? DEFAULT_SNOWFLAKE_EPOCH;
  if (!Number.isSafeInteger(epoch) || epoch < 0) {
    throw new ConfigurationError('INVALID_OPTION', 'epoch must be Unix milliseconds.', { option: 'epoch' });
  }
  const workerBits = assertInteger('workerBits', layout.workerBits ?? 10, 0, 22);
  const sequenceBits = assertInteger('sequenceBits', layout.sequenceBits ?? 12, 1, 22);
  if (workerBits + sequenceBits > 22) {
    throw new ConfigurationError('INVALID_OPTION', 'workerBits and sequenceBits together may use at most 22 bits.', {
      workerBits,
      sequenceBits,
    });
  }
  return { epoch: BigInt(epoch), workerBits: BigInt(workerBits), sequenceBits: BigInt(sequenceBits) };
};

/** Splits a Snowflake ID into its parts. The layout must match the one used to create it. */
export const parseSnowflake = (id: string | bigint, layout: SnowflakeLayout = {}): SnowflakeParts => {
  const { epoch, workerBits, sequenceBits } = resolveLayout(layout);
  let value: bigint;
  if (typeof id === 'bigint') {
    value = id;
  } else if (/^\d{1,20}$/.test(id)) {
    value = BigInt(id);
  } else {
    throw new ValidationError('INVALID_VALUE', 'A Snowflake ID is a positive integer.', { value: id });
  }
  if (value < 0n || value >= 1n << 63n) {
    throw new ValidationError('INVALID_VALUE', 'A Snowflake ID fits into 63 bits.', { value: String(id) });
  }
  const sequenceMask = (1n << sequenceBits) - 1n;
  const workerMask = (1n << workerBits) - 1n;
  return {
    timestamp: new Date(Number((value >> (workerBits + sequenceBits)) + epoch)),
    workerId: Number((value >> sequenceBits) & workerMask),
    sequence: Number(value & sequenceMask),
  };
};

/**
 * 64-bit IDs as used by Twitter and Discord: 41 bits time, then worker number and sequence. IDs sort by time and need
 * no coordination as long as every running generator has its own worker number.
 */
export const createSnowflake = (options: SnowflakeOptions = {}): SnowflakeGenerator => {
  const layout = resolveLayout(options);
  const { epoch, workerBits, sequenceBits } = layout;
  const workerId = BigInt(assertInteger('workerId', options.workerId ?? 0, 0, 2 ** Number(workerBits) - 1));
  const maxSequence = (1n << sequenceBits) - 1n;
  const now = options.now ?? Date.now;
  let lastTimestamp = -1n;
  let sequence = 0n;

  const nextBigInt = (): bigint => {
    const clock = Math.floor(now());
    if (!Number.isSafeInteger(clock)) {
      throw new ConfigurationError('INVALID_OPTION', 'The clock must return Unix milliseconds.', { clock });
    }
    const current = BigInt(clock) - epoch;
    if (current < 0n) {
      throw new ConfigurationError('INVALID_OPTION', 'The clock is before the configured epoch.', {
        epoch: Number(epoch),
      });
    }
    let timestamp = current;
    let nextSequence = 0n;
    if (current <= lastTimestamp) {
      // Same millisecond or the clock went back: stay on the last timestamp and count up. A full sequence moves on
      // to the next millisecond instead of waiting, so IDs stay unique and ordered.
      timestamp = lastTimestamp;
      nextSequence = sequence + 1n;
      if (nextSequence > maxSequence) {
        nextSequence = 0n;
        timestamp += 1n;
      }
    }
    // Checked before the state changes, so a failed call never lets a later one reuse an ID.
    if (timestamp > MAX_TIMESTAMP_OFFSET) {
      throw new IdGeneratorError('CLOCK_OVERFLOW', 'The 41-bit time range of this epoch is used up.');
    }
    lastTimestamp = timestamp;
    sequence = nextSequence;
    return (timestamp << (workerBits + sequenceBits)) | (workerId << sequenceBits) | sequence;
  };

  return {
    next: () => nextBigInt().toString(),
    nextBigInt,
    parse: (id) => parseSnowflake(id, options),
  };
};

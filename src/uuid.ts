// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { ConfigurationError, ValidationError } from './errors.js';
import { pooledRandomBytes } from './random.js';

/** The nil UUID (all bits zero), RFC 9562 section 5.9. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
/** The max UUID (all bits one), RFC 9562 section 5.10. */
export const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-8])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));
const MAX_TIMESTAMP = 2 ** 48 - 1;

const format = (bytes: Uint8Array): string => {
  let hex = '';
  for (const [index, byte] of bytes.entries()) {
    if (index === 4 || index === 6 || index === 8 || index === 10) {
      hex += '-';
    }
    hex += HEX[byte]!;
  }
  return hex;
};

/** Random UUID (version 4). Uses crypto.randomUUID where available. */
export const uuidv4 = (): string => {
  // Older runtimes have getRandomValues but no randomUUID.
  const api = globalThis.crypto as Crypto | undefined;
  if (typeof api?.randomUUID === 'function') {
    return api.randomUUID();
  }
  const bytes = pooledRandomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return format(bytes);
};

export interface UuidV7Options {
  /** Clock in milliseconds since the Unix epoch. Defaults to `Date.now`. */
  now?: () => number;
}

/** Creates a UUID v7 source with its own monotonic state. */
export const createUuidV7 = (options: UuidV7Options = {}): (() => string) => {
  const now = options.now ?? Date.now;
  let lastTimestamp = -1;
  let counter = 0;

  return () => {
    let timestamp = Math.floor(now());
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) {
      throw new ConfigurationError('INVALID_OPTION', 'The clock must return milliseconds from 0 to 2^48 - 1.', {
        timestamp,
      });
    }
    const bytes = pooledRandomBytes(16);
    if (timestamp > lastTimestamp) {
      // RFC 9562 method 1: a 12-bit counter in rand_a, seeded randomly with the top bit clear for headroom.
      counter = ((bytes[6]! & 0x07) << 8) | bytes[7]!;
      lastTimestamp = timestamp;
    } else {
      // Same millisecond or the clock went back: keep the order by counting up, borrowing the next millisecond
      // once the counter is used up.
      counter += 1;
      if (counter > 0xfff) {
        counter = 0;
        lastTimestamp += 1;
      }
      timestamp = lastTimestamp;
    }

    bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
    bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
    bytes[2] = (timestamp >>> 24) & 0xff;
    bytes[3] = (timestamp >>> 16) & 0xff;
    bytes[4] = (timestamp >>> 8) & 0xff;
    bytes[5] = timestamp & 0xff;
    bytes[6] = 0x70 | (counter >>> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    return format(bytes);
  };
};

/**
 * Time-ordered UUID (version 7): 48-bit Unix milliseconds, then random bits. IDs from the same process sort in the
 * order they were made, even within one millisecond.
 */
export const uuidv7: () => string = createUuidV7();

/** True for a UUID of versions 1 to 8 in canonical form; pass `version` to accept only that version. */
export const isUuid = (value: unknown, version?: number): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const match = UUID_PATTERN.exec(value);
  return match !== null && (version === undefined || Number(match[1]) === version);
};

/** Version number of a UUID, or `undefined` for anything that is not a canonical UUID. */
export const uuidVersion = (value: string): number | undefined =>
  isUuid(value) ? Number.parseInt(value.charAt(14), 16) : undefined;

/** Creation time stored in a UUID v7. */
export const uuidv7Timestamp = (value: string): Date => {
  if (!isUuid(value, 7)) {
    throw new ValidationError('INVALID_VALUE', 'Not a UUID v7.', { value });
  }
  return new Date(Number.parseInt(value.slice(0, 8) + value.slice(9, 13), 16));
};

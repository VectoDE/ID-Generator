// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { isUlid, ulidTimestamp } from './ulid.js';
import { MAX_UUID, NIL_UUID, isUuid, uuidVersion, uuidv7Timestamp } from './uuid.js';

export interface InspectResult {
  /** `uuid` and `ulid` are recognised by their format; anything else is `unknown`. */
  type: 'uuid' | 'ulid' | 'unknown';
  /** UUID version (1 to 8). */
  version?: number;
  /** Creation time, for UUID v7 and ULID. */
  timestamp?: Date;
}

/**
 * Tells which standard format an ID has and reads its creation time where the format stores one. Snowflake IDs are
 * plain numbers and need their layout, so use `parseSnowflake` for them.
 */
export const inspectId = (value: string): InspectResult => {
  if (typeof value !== 'string') {
    return { type: 'unknown' };
  }
  // Nil and max UUIDs have no version digit, so isUuid does not accept them.
  const lower = value.toLowerCase();
  if (lower === NIL_UUID || lower === MAX_UUID) {
    return { type: 'uuid' };
  }
  if (isUuid(value)) {
    const version = uuidVersion(value)!;
    return { type: 'uuid', version, ...(version === 7 ? { timestamp: uuidv7Timestamp(value) } : {}) };
  }
  if (isUlid(value)) {
    return { type: 'ulid', timestamp: ulidTimestamp(value) };
  }
  return { type: 'unknown' };
};

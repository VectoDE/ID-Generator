// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from 'vitest';
import { DEFAULT_SNOWFLAKE_EPOCH, createSnowflake, parseSnowflake } from '../src/snowflake.js';

const AT = Date.UTC(2026, 9, 12, 8, 30);

describe('createSnowflake', () => {
  it('encodes time, worker and sequence', () => {
    const generator = createSnowflake({ workerId: 5, now: () => AT });
    const first = generator.next();
    const second = generator.nextBigInt();
    expect(first).toMatch(/^\d+$/);
    expect(generator.parse(first)).toEqual({ timestamp: new Date(AT), workerId: 5, sequence: 0 });
    expect(generator.parse(second)).toEqual({ timestamp: new Date(AT), workerId: 5, sequence: 1 });
    expect(parseSnowflake(first).workerId).toBe(5);
  });

  it('keeps IDs ordered across milliseconds and when the clock goes back', () => {
    const times = [AT, AT + 1, AT - 10, AT + 2];
    const generator = createSnowflake({ now: () => times.shift() ?? AT + 3 });
    const ids = Array.from({ length: 5 }, () => generator.nextBigInt());
    expect([...ids].sort((a, b) => (a < b ? -1 : 1))).toEqual(ids);
    expect(generator.parse(ids[2]!)).toMatchObject({ timestamp: new Date(AT + 1), sequence: 1 });
  });

  it('moves to the next millisecond when the sequence is full', () => {
    const generator = createSnowflake({ sequenceBits: 1, workerBits: 0, now: () => AT });
    const parts = Array.from({ length: 3 }, () => generator.parse(generator.next()));
    expect(parts.map((part) => part.sequence)).toEqual([0, 1, 0]);
    expect(parts[2]!.timestamp.getTime()).toBe(AT + 1);
  });

  it('supports custom layouts', () => {
    const layout = { epoch: Date.UTC(2020, 0, 1), workerBits: 5, sequenceBits: 8 };
    const generator = createSnowflake({ ...layout, workerId: 31, now: () => AT });
    const id = generator.next();
    expect(parseSnowflake(id, layout)).toEqual({ timestamp: new Date(AT), workerId: 31, sequence: 0 });
  });

  it('rejects invalid settings', () => {
    expect(() => createSnowflake({ workerId: 1024 })).toThrow(/workerId/);
    expect(() => createSnowflake({ workerBits: 12, sequenceBits: 12 })).toThrow(/22 bits/);
    expect(() => createSnowflake({ sequenceBits: 0 })).toThrow(/sequenceBits/);
    expect(() => createSnowflake({ epoch: -1 })).toThrow(/epoch/);
    expect(() => createSnowflake({ epoch: 1.5 })).toThrow(/epoch/);
  });

  it('rejects a clock that does not return milliseconds', () => {
    expect(() => createSnowflake({ now: () => Number.NaN }).next()).toThrow(/Unix milliseconds/);
    expect(() => createSnowflake({ now: () => Infinity }).next()).toThrow(/Unix milliseconds/);
  });

  it('does not move on after hitting the end of the time range', () => {
    const last = 2 ** 41 - 1;
    const generator = createSnowflake({ epoch: 0, workerBits: 0, sequenceBits: 1, now: () => last });
    expect(generator.parse(generator.next()).sequence).toBe(0);
    expect(generator.parse(generator.next()).sequence).toBe(1);
    expect(() => generator.next()).toThrow(/41-bit/);
    expect(() => generator.next()).toThrow(/41-bit/);
  });

  it('fails when the clock is before the epoch or past the 41-bit range', () => {
    expect(() => createSnowflake({ now: () => DEFAULT_SNOWFLAKE_EPOCH - 1 }).next()).toThrow(/before/);
    expect(() => createSnowflake({ epoch: 0, now: () => 2 ** 41 }).next()).toThrow(/41-bit/);
  });
});

describe('parseSnowflake', () => {
  it('accepts strings and BigInts in 63 bits', () => {
    expect(parseSnowflake(0n)).toEqual({ timestamp: new Date(DEFAULT_SNOWFLAKE_EPOCH), workerId: 0, sequence: 0 });
    expect(() => parseSnowflake('-1')).toThrow(/positive integer/);
    expect(() => parseSnowflake('12a')).toThrow(/positive integer/);
    expect(() => parseSnowflake(-1n)).toThrow(/63 bits/);
    expect(() => parseSnowflake((1n << 63n).toString())).toThrow(/63 bits/);
  });
});

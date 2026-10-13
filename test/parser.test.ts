// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from 'vitest';
import { assertDateFormat, dateFormatMatcher, formatDate } from '../src/pattern/date.js';
import { parsePattern, tokenNames } from '../src/pattern/parser.js';
import { escapeRegExp } from '../src/pattern/regex.js';

describe('parsePattern', () => {
  it('splits literals and tokens', () => {
    expect(parsePattern('INV-{year}-{seq:5}')).toEqual([
      { type: 'literal', value: 'INV-' },
      { type: 'token', name: 'year', arg: undefined },
      { type: 'literal', value: '-' },
      { type: 'token', name: 'seq', arg: '5' },
    ]);
  });

  it('keeps everything after the first colon as the argument', () => {
    expect(parsePattern('{date:HH:mm}')).toEqual([{ type: 'token', name: 'date', arg: 'HH:mm' }]);
    expect(parsePattern('{ seq :}')).toEqual([{ type: 'token', name: 'seq', arg: '' }]);
  });

  it('turns doubled braces into literal ones', () => {
    expect(parsePattern('{{{seq}}}')).toEqual([
      { type: 'literal', value: '{' },
      { type: 'token', name: 'seq', arg: undefined },
      { type: 'literal', value: '}' },
    ]);
  });

  it('reports errors with their position', () => {
    expect(() => parsePattern('')).toThrow(/non-empty/);
    expect(() => parsePattern(42 as unknown as string)).toThrow(/non-empty/);
    expect(() => parsePattern('x'.repeat(1025))).toThrow(/1024/);
    expect(() => parsePattern('A-{seq')).toThrow(/Unclosed "\{".*position 2/);
    expect(() => parsePattern('{a{b}}')).toThrow(/Unclosed/);
    expect(() => parsePattern('A}')).toThrow(/Unexpected "\}".*position 1/);
    expect(() => parsePattern('{1abc}')).toThrow(/not a valid token name/);
    expect(() => parsePattern('{}')).toThrow(/not a valid token name/);
  });

  it('lists distinct token names', () => {
    expect(tokenNames(parsePattern('{a}-{b}-{a:2}'))).toEqual(['a', 'b']);
  });
});

describe('date formatting', () => {
  const date = new Date(Date.UTC(2026, 0, 5, 7, 8, 9, 45));

  it('fills every placeholder', () => {
    expect(formatDate(date, 'YYYY-MM-DD HH:mm:ss.SSS', true)).toBe('2026-01-05 07:08:09.045');
    expect(formatDate(date, 'YY/MM', true)).toBe('26/01');
    expect(formatDate(date, 'YYYY', false)).toBe(String(date.getFullYear()));
  });

  it('rejects unknown letters', () => {
    expect(() => assertDateFormat('YYYY-Q')).toThrow(/Unsupported date format/);
    expect(() => assertDateFormat('')).toThrow(/Unsupported/);
    expect(() => assertDateFormat('YYY')).toThrow(/Unsupported/);
    expect(assertDateFormat('YYYYYY.SSS')).toBe('YYYYYY.SSS');
  });

  it('checks long formats in linear time', () => {
    const started = performance.now();
    expect(() => assertDateFormat(`${'YYYY'.repeat(50_000)}!Q`)).toThrow(/Unsupported/);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('builds a matcher for the same format', () => {
    const matcher = new RegExp(`^${dateFormatMatcher('YYYY.MM.DD')}$`);
    expect(matcher.test(formatDate(date, 'YYYY.MM.DD', true))).toBe(true);
    expect(matcher.test('2026x01x05')).toBe(false);
  });

  it('escapes regular expression characters', () => {
    expect(new RegExp(`^${escapeRegExp('a.b*c+(d)[e]{f}|g^h$i\\j?')}$`).test('a.b*c+(d)[e]{f}|g^h$i\\j?')).toBe(true);
  });
});

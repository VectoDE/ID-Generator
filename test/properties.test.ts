// Property-based tests: random inputs against invariants, so parsers and formats are fuzzed on every test run.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { IdGeneratorError } from '../src/errors.js';
import { inspectId } from '../src/inspect.js';
import { customAlphabet } from '../src/nanoid.js';
import { assertDateFormat, dateFormatMatcher, formatDate } from '../src/pattern/date.js';
import { createPatternGenerator } from '../src/pattern/generator.js';
import { parsePattern } from '../src/pattern/parser.js';
import { MemorySequenceStore } from '../src/stores/memory.js';
import { createUlid, isUlid, ulidTimestamp } from '../src/ulid.js';
import { createUuidV7, isUuid, uuidv7Timestamp } from '../src/uuid.js';

const MAX_ULID_TIME = 2 ** 48 - 1;

// Only errors of the library's own types are acceptable answers to bad input.
const failsCleanly = (action: () => unknown): boolean => {
  try {
    action();
    return true;
  } catch (error) {
    return error instanceof IdGeneratorError;
  }
};

describe('fuzzed input', () => {
  it('parsePattern accepts or rejects any text with its own errors', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (pattern) => {
        expect(failsCleanly(() => parsePattern(pattern))).toBe(true);
      })
    );
  });

  it('inspectId describes any text without throwing', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (value) => {
        expect(['uuid', 'ulid', 'unknown']).toContain(inspectId(value).type);
      })
    );
  });

  it('date formats are accepted or rejected, never crash', () => {
    const format = fc.string({
      unit: fc.constantFrom('YYYY', 'YY', 'MM', 'DD', 'HH', 'mm', 'ss', 'SSS', 'Y', 'Q', '-', '/'),
    });
    fc.assert(
      fc.property(format, (value) => {
        expect(failsCleanly(() => assertDateFormat(value))).toBe(true);
      })
    );
  });
});

describe('round trips', () => {
  it('a formatted date matches the matcher of its format', () => {
    const format = fc
      .array(fc.constantFrom('YYYY', 'YY', 'MM', 'DD', 'HH', 'mm', 'ss', 'SSS', '-', '.', ' '), { minLength: 1 })
      .map((parts) => parts.join(''));
    const date = fc.date({ min: new Date(0), max: new Date(Date.UTC(9999, 11, 31)), noInvalidDate: true });
    fc.assert(
      fc.property(format, date, (value, moment) => {
        expect(formatDate(moment, value, true)).toMatch(new RegExp(`^${dateFormatMatcher(value)}$`));
      })
    );
  });

  it('a generated ID parses back to its sequence number', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 99_999 }), async (start) => {
        const generator = createPatternGenerator({
          pattern: 'INV-{year}-{seq:5}',
          store: new MemorySequenceStore({ start }),
        });
        const id = await generator.generate();
        expect(generator.matches(id)).toBe(true);
        expect(Number(generator.parse(id)?.seq)).toBe(start);
      }),
      { numRuns: 50 }
    );
  });

  it('a ULID keeps its timestamp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_ULID_TIME }), (time) => {
        const id = createUlid()(time);
        expect(isUlid(id)).toBe(true);
        expect(ulidTimestamp(id).getTime()).toBe(time);
      })
    );
  });

  it('a UUID v7 keeps its timestamp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_ULID_TIME }), (time) => {
        const id = createUuidV7({ now: () => time })();
        expect(isUuid(id, 7)).toBe(true);
        expect(uuidv7Timestamp(id).getTime()).toBe(time);
      })
    );
  });

  it('custom alphabets only use their characters', () => {
    const alphabet = fc.uniqueArray(fc.constantFrom(...Array.from('abcdefghijklmnopqrstuvwxyz0123456789')), {
      minLength: 2,
      maxLength: 36,
    });
    fc.assert(
      fc.property(alphabet, fc.integer({ min: 1, max: 64 }), (characters, size) => {
        const id = customAlphabet(characters.join(''))(size);
        expect(id).toHaveLength(size);
        expect(Array.from(id).every((character) => characters.includes(character))).toBe(true);
      })
    );
  });
});

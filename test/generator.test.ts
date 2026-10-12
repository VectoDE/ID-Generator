import { describe, expect, it, vi } from 'vitest';
import { IdGeneratorError } from '../src/errors.js';
import { createPatternGenerator, type PatternGeneratorOptions } from '../src/pattern/generator.js';
import { presets } from '../src/pattern/presets.js';
import { builtInTokens } from '../src/pattern/tokens.js';
import { MemorySequenceStore } from '../src/stores/memory.js';
import type { SequenceStore } from '../src/stores/types.js';

const FIXED = new Date(Date.UTC(2026, 9, 12, 8, 30, 15, 250));
const create = (options: PatternGeneratorOptions) => createPatternGenerator({ now: () => FIXED, ...options });

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> => {
  try {
    await promise;
  } catch (error) {
    return (error as IdGeneratorError).code;
  }
  return undefined;
};

describe('built-in tokens', () => {
  it('resolves date tokens from one moment', async () => {
    const generator = create({ pattern: '{year}{month}{day}|{date}|{date:YYYY-MM-DD HH:mm:ss.SSS}|{timestamp}' });
    expect(await generator.generate()).toBe(`20261012|20261012|2026-10-12 08:30:15.250|${FIXED.getTime()}`);
  });

  it('uses local time when utc is off', async () => {
    const generator = create({ pattern: '{date:YYYYMMDDHH}', utc: false });
    const local = `${FIXED.getFullYear()}${String(FIXED.getMonth() + 1).padStart(2, '0')}`;
    expect(await generator.generate()).toMatch(new RegExp(`^${local}`));
  });

  it('creates random and standard IDs', async () => {
    const generator = create({ pattern: '{random}.{random:3}.{uuid}.{uuid7}.{ulid}.{nanoid}.{nanoid:5}' });
    const id = await generator.generate();
    expect(generator.matches(id)).toBe(true);
    const [random6, random3, , , ulid, nano21, nano5] = id.split('.');
    expect(random6).toMatch(/^[A-Z0-9]{6}$/);
    expect(random3).toMatch(/^[A-Z0-9]{3}$/);
    expect(ulid).toHaveLength(26);
    expect(nano21).toHaveLength(21);
    expect(nano5).toHaveLength(5);
  });

  it('checks arguments when the generator is created', () => {
    expect(() => create({ pattern: '{seq:0}' })).toThrow(/length from 1 to 32/);
    expect(() => create({ pattern: '{seq:33}' })).toThrow(/length from 1 to 32/);
    expect(() => create({ pattern: '{random:x}' })).toThrow(/length/);
    expect(() => create({ pattern: '{nanoid:300}' })).toThrow(/length/);
    expect(() => create({ pattern: '{date:Q}' })).toThrow(/date format/);
    expect(() => create({ pattern: '{uuid:4}' })).toThrow(/takes no argument/);
    expect(() => create({ pattern: '{club:x}' })).toThrow(/takes no argument/);
  });

  it('describes every built-in token', () => {
    for (const token of Object.values(builtInTokens)) {
      expect(token.description).toBeTruthy();
    }
  });
});

describe('sequences', () => {
  it('counts up per scope, padded', async () => {
    const generator = create({ pattern: 'INV-{seq:4}' });
    expect(await generator.generateMany(3)).toEqual(['INV-0001', 'INV-0002', 'INV-0003']);
    expect(await create({ pattern: '{seq}' }).generate()).toBe('1');
  });

  it('shares one number when {seq} appears twice', async () => {
    const generator = create({ pattern: '{seq}-{seq:3}-{seq}' });
    expect(await generator.generate()).toBe('1-001-1');
    expect(await generator.generate()).toBe('2-002-2');
  });

  it('keeps separate counters per scope', async () => {
    const store = new MemorySequenceStore();
    const generator = create({ pattern: '{team}-{seq}', store, scope: (values) => String(values.team) });
    expect(await generator.generateMany([{ team: 'A' }, { team: 'B' }, { team: 'A' }])).toEqual(['A-1', 'B-1', 'A-2']);
    expect(store.snapshot()).toEqual({ A: 2, B: 1 });
    const fixed = create({ pattern: '{seq}', store, scope: 'shared' });
    await fixed.generate();
    expect(store.snapshot()).toMatchObject({ shared: 1 });
  });

  it('does not use up a number when a value is invalid', async () => {
    const store = new MemorySequenceStore();
    const generator = create({ pattern: '{code}-{seq}', store, tokens: { code: { validate: /[A-Z]+/ } } });
    expect(await codeOf(generator.generate({ code: 'bad' }))).toBe('INVALID_VALUE');
    expect(await codeOf(generator.generate())).toBe('MISSING_VALUE');
    expect(await generator.generate({ code: 'OK' })).toBe('OK-1');
  });

  it('rejects an empty scope', async () => {
    const generator = create({ pattern: '{seq}', scope: () => '' });
    expect(await codeOf(generator.generate())).toBe('INVALID_VALUE');
  });

  it('works with asynchronous stores', async () => {
    let value = 41;
    const store: SequenceStore = {
      next: () => Promise.resolve(++value),
      peek: () => Promise.resolve(value + 1),
      reset: () => Promise.resolve(),
    };
    const generator = create({ pattern: 'N{seq}', store });
    expect(await generator.preview()).toMatchObject({ id: 'N42' });
    expect(await generator.generate()).toBe('N42');
  });
});

describe('value tokens', () => {
  it('reads values, defaults, normalizers and validators', async () => {
    const generator = create({
      pattern: '{name}/{kind}/{note}',
      tokens: {
        name: { normalize: (value) => value.trim().toUpperCase(), validate: (value) => value.length <= 5 },
        kind: { default: 'std' },
        note: { required: false },
      },
    });
    expect(await generator.generate({ name: ' abc ' })).toBe('ABC/std/');
    expect(await generator.generate({ name: 'x', kind: 7, note: 10n })).toBe('X/7/10');
    expect(await codeOf(generator.generate({ name: 'toolong' }))).toBe('INVALID_VALUE');
    expect(await codeOf(generator.generate({ name: Number.NaN }))).toBe('INVALID_VALUE');
    expect(await codeOf(generator.generate({ name: true as unknown as string }))).toBe('INVALID_VALUE');
  });

  it('treats unknown tokens as required values', async () => {
    const generator = create({ pattern: '{a}' });
    expect(generator.tokens).toEqual([
      { name: 'a', kind: 'value', builtIn: false, required: true, description: undefined },
    ]);
    expect(await codeOf(generator.generate({ a: '' }))).toBe('MISSING_VALUE');
  });

  it('anchors RegExp validators and ignores global flags', async () => {
    const generator = create({ pattern: '{a}', tokens: { a: { validate: /\d+/g } } });
    expect(await generator.generate({ a: '12' })).toBe('12');
    expect(await generator.generate({ a: '34' })).toBe('34');
    expect(await codeOf(generator.generate({ a: '1x' }))).toBe('INVALID_VALUE');
  });

  it('lets own tokens replace built-in ones', async () => {
    const generator = create({ pattern: '{year}', tokens: { year: { resolve: () => 'Y' } } });
    expect(await generator.generate()).toBe('Y');
    expect(generator.tokens[0]).toMatchObject({ kind: 'computed', builtIn: false });
  });

  it('ignores inherited properties of the tokens object', async () => {
    const generator = create({ pattern: '{toString}' });
    expect(await generator.generate({ toString: 'x' })).toBe('x');
  });
});

describe('output checks', () => {
  it('applies the transform', async () => {
    const generator = create({ pattern: 'A-{x}', transform: (id, values) => `${id.toLowerCase()}:${values.x}` });
    expect(await generator.generate({ x: 'B' })).toBe('a-b:B');
  });

  it('rejects empty or too long IDs', async () => {
    expect(await codeOf(create({ pattern: '{x}', tokens: { x: { required: false } } }).generate())).toBe(
      'INVALID_VALUE'
    );
    expect(await codeOf(create({ pattern: '{x}', maxLength: 3 }).generate({ x: 'abcd' }))).toBe('INVALID_VALUE');
    expect(() => create({ pattern: 'x', maxLength: 0 })).toThrow(/maxLength/);
  });

  it('validates its input', async () => {
    expect(() => createPatternGenerator(null as unknown as PatternGeneratorOptions)).toThrow(/options object/);
    const generator = create({ pattern: '{seq}' });
    expect(await codeOf(generator.generate([] as never))).toBe('INVALID_VALUE');
    expect(await codeOf(generator.preview(null as never))).toBe('INVALID_VALUE');
    expect(await codeOf(generator.generateMany('3' as never))).toBe('INVALID_VALUE');
    await expect(generator.generateMany(-1)).rejects.toThrow(/count/);
    expect(await generator.generateMany(0)).toEqual([]);
  });
});

describe('preview', () => {
  it('shows values without using up a number', async () => {
    const store = new MemorySequenceStore();
    const generator = create({ pattern: '{a}-{seq}', store });
    expect(await generator.preview({ a: 'x' })).toEqual({
      id: 'x-1',
      tokens: [
        { name: 'a', value: 'x' },
        { name: 'seq', value: '1' },
      ],
    });
    expect(store.snapshot()).toEqual({});
  });

  it('lists token errors and leaves the id empty', async () => {
    const preview = await create({
      pattern: '{a}-{b}',
      // A non-Error rejection, as third-party token code might produce.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      tokens: { b: { resolve: () => Promise.reject('boom') } },
    }).preview();
    expect(preview.id).toBeUndefined();
    expect(preview.tokens).toEqual([
      { name: 'a', error: 'Missing value for "a".' },
      { name: 'b', error: 'boom' },
    ]);
  });

  it('leaves the id empty when assembling fails', async () => {
    const preview = await create({ pattern: '{a}', maxLength: 2 }).preview({ a: 'abc' });
    expect(preview).toEqual({ id: undefined, tokens: [{ name: 'a', value: 'abc' }] });
  });
});

describe('parse and matches', () => {
  it('reads values back out', async () => {
    const generator = create({ pattern: 'INV-{year}-{seq:5}' });
    const id = await generator.generate();
    expect(generator.parse(id)).toEqual({ year: '2026', seq: '00001' });
    expect(generator.matches('INV-2026-1')).toBe(false);
    expect(generator.matches('INV-2026-123456')).toBe(true);
    expect(generator.parse(42 as unknown as string)).toBeNull();
    expect(generator.parse('x'.repeat(300))).toBeNull();
  });

  it('requires repeated tokens to be equal', () => {
    const generator = create({ pattern: '{a}.{a}' });
    expect(generator.parse('x.x')).toEqual({ a: 'x' });
    expect(generator.parse('x.y')).toBeNull();
  });

  it('keeps the first value when a name has different arguments', async () => {
    const generator = create({ pattern: '{date:YYYY}/{date:MM}' });
    expect(generator.parse(await generator.generate())).toEqual({ date: '2026' });
  });

  it('escapes literal text', () => {
    const generator = create({ pattern: 'a.b{{{x}}}' });
    expect(generator.parse('a.b{1}')).toEqual({ x: '1' });
    expect(generator.matches('axb{1}')).toBe(false);
  });

  it('uses string matchers of own tokens', () => {
    const generator = create({
      pattern: '{a}{b}',
      tokens: { a: { match: '\\d{2}' }, b: { resolve: () => 'z', match: 'z' } },
    });
    expect(generator.parse('12z')).toEqual({ a: '12', b: 'z' });
  });

  it('round-trips the club preset', async () => {
    const generator = create({ ...presets.club });
    const id = await generator.generate({ club: ' hk net ', role: '1 _2', area: '12a' });
    expect(id).toBe('HK-NET#1-2/12A-2026');
    expect(generator.parse(id)).toEqual({ club: 'HK-NET', role: '1-2', area: '12A', year: '2026' });
    expect(await generator.generate({ ...presets.club.example })).toBe('HKNET#1-2/1234-2024');
    expect(await codeOf(generator.generate({ club: '--', role: '1', area: '1' }))).toBe('INVALID_VALUE');
    expect(await codeOf(generator.generate({ club: 'A', role: '1', area: '1', year: '26' }))).toBe('INVALID_VALUE');
  });

  it('uses the local year in the club preset when utc is off', async () => {
    const generator = create({ ...presets.club, utc: false });
    expect(await generator.generate({ club: 'A', role: '1', area: '1' })).toBe(`A#1/1-${FIXED.getFullYear()}`);
  });

  it('builds invoice and order numbers', async () => {
    expect(await create({ ...presets.invoice }).generate()).toBe('INV-2026-00001');
    expect(await create({ ...presets.order }).generate()).toMatch(/^ORD-20261012-[A-Z0-9]{6}$/);
  });
});

describe('review regressions', () => {
  it('passes normalized values to the scope, so equal IDs share a counter', async () => {
    const store = new MemorySequenceStore();
    const generator = create({
      pattern: '{team}-{seq:4}',
      tokens: { team: { normalize: (value) => value.trim().toUpperCase() } },
      store,
      scope: (values) => String(values.team),
    });
    expect(await generator.generateMany([{ team: ' ops ' }, { team: 'ops' }, { team: 'OPS' }])).toEqual([
      'OPS-0001',
      'OPS-0002',
      'OPS-0003',
    ]);
    expect(store.snapshot()).toEqual({ OPS: 3 });
  });

  it('passes computed tokens to the scope', async () => {
    const store = new MemorySequenceStore();
    const generator = create({ ...presets.invoice, store, scope: (values) => String(values.year) });
    await generator.generate();
    expect(store.snapshot()).toEqual({ 2026: 1 });
  });

  it('keeps "__proto__" values as plain data in the scope', async () => {
    const seen: unknown[] = [];
    const generator = create({
      pattern: '{__proto__}-{seq}',
      scope: (values) => {
        seen.push(Object.getPrototypeOf(values));
        return 'x';
      },
    });
    expect(await generator.generate(JSON.parse('{"__proto__":"a"}') as Record<string, string>)).toBe('a-1');
    // Called for the dry run and for the real number; neither time with a polluted prototype.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((prototype) => prototype === Object.prototype)).toBe(true);
  });

  it('does not use up a number when transform or maxLength rejects the ID', async () => {
    const store = new MemorySequenceStore();
    const failing = create({
      pattern: '{a}-{seq}',
      store,
      scope: 's',
      transform: () => {
        throw new Error('nope');
      },
    });
    await expect(failing.generate({ a: 'x' })).rejects.toThrow('nope');
    const short = create({ pattern: '{a}-{seq}', store, scope: 's', maxLength: 4 });
    expect(await codeOf(short.generate({ a: 'long' }))).toBe('INVALID_VALUE');
    expect(store.snapshot()).toEqual({});
    expect(await short.generate({ a: 'x' })).toBe('x-1');
  });

  it('parses a repeated token followed by a digit', async () => {
    const generator = create({ pattern: '{date:YYYY}-{date:YYYY}0' });
    const id = await generator.generate();
    expect(id).toBe('2026-20260');
    expect(generator.parse(id)).toEqual({ date: '2026' });
    expect(generator.parse('2026-20250')).toBeNull();
  });

  it('ignores capturing groups inside a custom match', () => {
    const generator = create({ pattern: '{a}-{b}', tokens: { a: { match: String.raw`(ab|cd)\d` } } });
    expect(generator.parse('cd7-rest')).toEqual({ a: 'cd7', b: 'rest' });
  });

  it('reads back values with line breaks', async () => {
    const generator = create({ pattern: '[{a}]' });
    const id = await generator.generate({ a: 'x\ny' });
    expect(generator.parse(id)).toEqual({ a: 'x\ny' });
  });

  it('does not treat Object.prototype names as built-in tokens', async () => {
    const generator = create({ pattern: '{constructor}' });
    expect(generator.tokens[0]).toMatchObject({ kind: 'value', builtIn: false });
    expect(await codeOf(generator.generate())).toBe('MISSING_VALUE');
  });

  it('returns parsed values as plain data, also for "__proto__"', () => {
    const parsed = create({ pattern: '{__proto__}!' }).parse('x!');
    expect(Object.keys(parsed!)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });
});

describe('defaults', () => {
  it('uses the real clock and a memory store without options', async () => {
    vi.useFakeTimers({ now: FIXED });
    try {
      expect(await createPatternGenerator({ pattern: '{year}-{seq}' }).generate()).toBe('2026-1');
    } finally {
      vi.useRealTimers();
    }
  });
});

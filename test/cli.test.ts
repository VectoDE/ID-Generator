import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXIT, HELP, runCli } from '../src/cli/run.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'id-generator-cli-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const run = async (...argv: string[]) => {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    cwd,
  });
  return { code, stdout, stderr, lines: stdout.trimEnd().split('\n') };
};

describe('meta options', () => {
  it('prints version and help', async () => {
    expect(await run('--version')).toMatchObject({ code: EXIT.ok, stdout: `${__VERSION__}\n` });
    expect(await run('-h')).toMatchObject({ code: EXIT.ok, stdout: HELP });
    expect(await run('uuid', '--help')).toMatchObject({ code: EXIT.ok, stdout: HELP });
  });

  it('shows help on stderr without a command', async () => {
    expect(await run()).toMatchObject({ code: EXIT.usage, stderr: HELP, stdout: '' });
  });

  it('rejects unknown commands and options', async () => {
    expect(await run('nope')).toMatchObject({ code: EXIT.usage, stderr: expect.stringContaining('unknown command') });
    expect(await run('constructor')).toMatchObject({ code: EXIT.usage });
    expect(await run('uuid', '--bogus')).toMatchObject({ code: EXIT.usage, stderr: expect.stringContaining('--help') });
  });
});

describe('standard IDs', () => {
  it('makes several IDs in each format', async () => {
    const uuid = await run('uuid', '-n', '3');
    expect(uuid.code).toBe(EXIT.ok);
    expect(uuid.lines).toHaveLength(3);
    expect((await run('uuid7')).stdout).toMatch(/^[0-9a-f-]{36}\n$/);
    expect((await run('ulid', '--count', '2')).lines.every((id) => id.length === 26)).toBe(true);
    expect((await run('snowflake', '--worker', '3')).stdout).toMatch(/^\d+\n$/);
    expect((await run('snowflake', '--epoch', '2020-01-01T00:00:00Z')).code).toBe(EXIT.ok);
    expect((await run('snowflake', '--epoch', '1577836800000')).code).toBe(EXIT.ok);
  });

  it('supports nanoid sizes and alphabets', async () => {
    expect((await run('nanoid')).stdout).toMatch(/^[\w-]{21}\n$/);
    expect((await run('nanoid', '--size', '8', '--alphabet', 'numbers')).stdout).toMatch(/^\d{8}\n$/);
    expect((await run('nanoid', '--size', '5', '--alphabet', 'ab')).stdout).toMatch(/^[ab]{5}\n$/);
    // Inherited names are not alphabets; this one is taken as characters and has a repeated "t".
    expect(await run('nanoid', '--alphabet', 'toString')).toMatchObject({
      code: EXIT.usage,
      stderr: expect.stringContaining('repeat'),
    });
  });

  it('writes json and csv', async () => {
    const json = await run('uuid', '-n', '2', '-f', 'json');
    expect(JSON.parse(json.stdout)).toHaveLength(2);
    const csv = await run('ulid', '-n', '2', '--format', 'csv');
    expect(csv.lines[0]).toBe('id');
    expect(csv.lines).toHaveLength(3);
  });

  it('reports usage errors with exit code 2', async () => {
    for (const argv of [
      ['uuid', '-n', '0'],
      ['uuid', '-n', '100001'],
      ['uuid', '-n', '1.5'],
      ['uuid', '-f', 'xml'],
      ['nanoid', '--size', '999'],
      ['snowflake', '--worker', '1024'],
      ['snowflake', '--epoch', 'yesterday'],
    ]) {
      expect(await run(...argv), argv.join(' ')).toMatchObject({ code: EXIT.usage, stdout: '' });
    }
  });

  it('treats an invalid alphabet or epoch as wrong usage', async () => {
    expect(await run('nanoid', '--alphabet', 'aa')).toMatchObject({ code: EXIT.usage });
    expect(await run('snowflake', '--epoch', '2999-01-01')).toMatchObject({ code: EXIT.usage });
  });
});

describe('pattern', () => {
  it('continues the sequence across runs in the state file', async () => {
    expect((await run('pattern', 'INV-{seq:3}', '-n', '2')).lines).toEqual(['INV-001', 'INV-002']);
    expect((await run('pattern', '--pattern', 'INV-{seq:3}')).stdout).toBe('INV-003\n');
    const state = JSON.parse(await readFile(join(cwd, '.id-generator-state.json'), 'utf8')) as unknown;
    expect(state).toEqual({ version: 1, counters: { 'INV-{seq:3}': 3 } });
  });

  it('uses another state file, a scope or memory only', async () => {
    await run('pattern', '{seq}', '--state', 'other.json', '--scope', 'x');
    expect(JSON.parse(await readFile(join(cwd, 'other.json'), 'utf8'))).toEqual({ version: 1, counters: { x: 1 } });
    expect((await run('pattern', '{seq}', '--memory')).stdout).toBe('1\n');
    expect((await run('pattern', '{seq}', '--memory')).stdout).toBe('1\n');
    await expect(readFile(join(cwd, '.id-generator-state.json'))).rejects.toThrow();
  });

  it('fills presets and values', async () => {
    const club = await run(
      'pattern',
      '--preset',
      'club',
      '--set',
      'club=hk net',
      '--set',
      'role=1-2',
      '--set',
      'area=12',
      '--set',
      'year=2024'
    );
    expect(club).toMatchObject({ code: EXIT.ok, stdout: 'HK-NET#1-2/12-2024\n' });
    expect((await run('pattern', 'X-{a}', '--set', 'a=b=c', '--memory')).stdout).toBe('X-b=c\n');
    expect((await run('pattern', '{year}', '--local', '--memory')).stdout).toBe(`${new Date().getFullYear()}\n`);
  });

  it('previews without using up a number', async () => {
    const preview = await run('pattern', '{a}-{seq}', '--preview', '--set', 'a=x', '-f', 'json');
    expect(JSON.parse(preview.stdout)).toEqual({ a: 'x', seq: '1', id: 'x-1' });
    expect((await run('pattern', '{a}-{seq}', '--set', 'a=x')).stdout).toBe('x-1\n');
  });

  it('exits with 1 when a preview cannot build the ID', async () => {
    const preview = await run('pattern', '{a}', '--preview', '--memory');
    expect(preview.code).toBe(EXIT.failure);
    expect(preview.stdout).toBe('a: error: Missing value for "a".\nid: \n');
    expect(preview.stderr).toContain('cannot be built');
  });

  it('reports bad input', async () => {
    expect(await run('pattern')).toMatchObject({ code: EXIT.usage });
    expect(await run('pattern', '--preset', 'nope')).toMatchObject({
      code: EXIT.usage,
      stderr: expect.stringContaining('club'),
    });
    expect(await run('pattern', '{a}', '--set', 'novalue')).toMatchObject({ code: EXIT.usage });
    expect(await run('pattern', '{a}', '--set', '=x')).toMatchObject({ code: EXIT.usage });
    expect(await run('pattern', '{a}', '--memory')).toMatchObject({
      code: EXIT.failure,
      stderr: expect.stringContaining('"a"'),
    });
    expect(await run('pattern', '{seq', '--memory')).toMatchObject({ code: EXIT.usage });
  });
});

describe('parse and inspect', () => {
  it('reads values back in every format', async () => {
    const text = await run('parse', 'HKNET#1-2/1234-2024', '--preset', 'club');
    expect(text.lines).toEqual(['club: HKNET', 'role: 1-2', 'area: 1234', 'year: 2024']);
    const json = await run('parse', 'INV-2026-00042', '--pattern', 'INV-{year}-{seq:5}', '-f', 'json');
    expect(JSON.parse(json.stdout)).toEqual({ year: '2026', seq: '00042' });
    const csv = await run('parse', 'a,"b"', '--pattern', '{x}', '-f', 'csv');
    expect(csv.stdout).toBe('name,value\nx,"a,""b"""\n');
  });

  it('fails for IDs that do not match and without an ID', async () => {
    expect(await run('parse', 'nope', '--preset', 'invoice')).toMatchObject({ code: EXIT.failure });
    expect(await run('parse', '--preset', 'invoice')).toMatchObject({ code: EXIT.usage });
  });

  it('inspects UUIDs and ULIDs', async () => {
    const uuid7 = (await run('uuid7')).lines[0]!;
    expect((await run('inspect', uuid7)).lines).toEqual([
      'type: uuid',
      'version: 7',
      expect.stringMatching(/^timestamp: \d{4}-/),
    ]);
    expect((await run('inspect', 'whatever')).stdout).toBe('type: unknown\n');
    expect(await run('inspect')).toMatchObject({ code: EXIT.usage });
  });
});

describe('listings', () => {
  it('lists presets and tokens', async () => {
    expect((await run('presets')).lines).toContain('club: {club}#{role}/{area}-{year}');
    const tokens = await run('tokens', '-f', 'json');
    expect(Object.keys(JSON.parse(tokens.stdout) as object)).toContain('{seq}');
  });
});

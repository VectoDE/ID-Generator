// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import { resolve } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { ConfigurationError, IdGeneratorError } from '../errors.js';
import { inspectId } from '../inspect.js';
import { alphabets, customAlphabet, nanoid } from '../nanoid.js';
import { createPatternGenerator, type PatternGeneratorOptions } from '../pattern/generator.js';
import { presets, type PresetName } from '../pattern/presets.js';
import { builtInTokens } from '../pattern/tokens.js';
import { createSnowflake } from '../snowflake.js';
import { FileSequenceStore } from '../stores/file.js';
import { MemorySequenceStore } from '../stores/memory.js';
import { ulid } from '../ulid.js';
import { uuidv4, uuidv7 } from '../uuid.js';

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Directory relative paths are resolved against. */
  cwd: string;
}

/** Exit codes: 0 success, 1 the IDs could not be made, 2 wrong usage (options, pattern, alphabet). */
export const EXIT = { ok: 0, failure: 1, usage: 2 } as const;

const DEFAULT_STATE_FILE = '.id-generator-state.json';
const MAX_COUNT = 100_000;

export const HELP = `Usage: id-generator <command> [options]

Commands
  uuid                 Random UUID v4
  uuid7                Time-ordered UUID v7
  ulid                 ULID (26 characters, time-ordered)
  nanoid               Short random ID            --size <n>, --alphabet <name|characters>
  snowflake            64-bit Snowflake ID        --worker <n>, --epoch <ms|ISO date>
  pattern [pattern]    ID from your own pattern   --set name=value, --preset <name>, --scope <name>,
                                                  --state <file>, --memory, --local, --preview
  parse <id>           Read values back out of an ID   --pattern <pattern> or --preset <name>
  inspect <id>         Detect UUID or ULID and show the time stored in it
  presets              List ready-made patterns
  tokens               List built-in pattern tokens

Options
  -n, --count <n>      How many IDs to make (default 1, at most ${MAX_COUNT})
  -f, --format <fmt>   text (default), json or csv
  -h, --help           Show this help
  -v, --version        Show the version

Sequences ({seq}) continue across runs: counters are stored in ${DEFAULT_STATE_FILE} in the current
directory unless you pass --state <file> or --memory.

Examples
  id-generator uuid7 -n 3
  id-generator pattern "INV-{year}-{seq:5}"
  id-generator pattern --preset club --set club=HKNET --set role=1-2 --set area=1234
  id-generator parse "HKNET#1-2/1234-2026" --preset club --format json
`;

const OPTIONS = {
  count: { type: 'string', short: 'n' },
  format: { type: 'string', short: 'f' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  size: { type: 'string' },
  alphabet: { type: 'string' },
  worker: { type: 'string' },
  epoch: { type: 'string' },
  set: { type: 'string', multiple: true },
  preset: { type: 'string' },
  pattern: { type: 'string' },
  scope: { type: 'string' },
  state: { type: 'string' },
  memory: { type: 'boolean' },
  local: { type: 'boolean' },
  preview: { type: 'boolean' },
} satisfies ParseArgsConfig['options'];

type Options = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>['values'];
type Format = 'text' | 'json' | 'csv';

class UsageError extends Error {}

const toInteger = (name: string, value: string | undefined, fallback: number, min: number, max: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < min || number > max) {
    throw new UsageError(`--${name} must be a whole number from ${min} to ${max}.`);
  }
  return number;
};

const formatOf = (options: Options): Format => {
  const format = options.format ?? 'text';
  if (format !== 'text' && format !== 'json' && format !== 'csv') {
    throw new UsageError('--format must be text, json or csv.');
  }
  return format;
};

const csvCell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

const lines = (rows: readonly string[]): string => `${rows.join('\n')}\n`;

const printIds = (io: CliIo, ids: readonly string[], format: Format): void => {
  if (format === 'json') {
    io.stdout(lines([JSON.stringify(ids, null, 2)]));
  } else if (format === 'csv') {
    io.stdout(lines(['id', ...ids.map((id) => csvCell(id))]));
  } else {
    io.stdout(lines(ids));
  }
};

const printRecord = (io: CliIo, record: Record<string, string>, format: Format): void => {
  const entries = Object.entries(record);
  if (format === 'json') {
    io.stdout(lines([JSON.stringify(record, null, 2)]));
  } else if (format === 'csv') {
    io.stdout(lines(['name,value', ...entries.map(([name, value]) => [csvCell(name), csvCell(value)].join(','))]));
  } else {
    io.stdout(lines(entries.map(([name, value]) => `${name}: ${value}`)));
  }
};

const presetOf = (name: string | undefined) => {
  if (name === undefined) {
    return undefined;
  }
  if (!Object.hasOwn(presets, name)) {
    throw new UsageError(`Unknown preset "${name}". Available: ${Object.keys(presets).join(', ')}.`);
  }
  return presets[name as PresetName];
};

const valuesOf = (options: Options): Record<string, string> => {
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const entry of options.set ?? []) {
    const separator = entry.indexOf('=');
    if (separator < 1) {
      throw new UsageError(`--set expects name=value, got "${entry}".`);
    }
    values[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return values;
};

const parseEpoch = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const epoch = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isSafeInteger(epoch)) {
    throw new UsageError('--epoch must be Unix milliseconds or an ISO date.');
  }
  return epoch;
};

const patternOptions = (options: Options, positional: string | undefined, io: CliIo): PatternGeneratorOptions => {
  const preset = presetOf(options.preset);
  const pattern = positional ?? options.pattern ?? preset?.pattern;
  if (pattern === undefined) {
    throw new UsageError('Give a pattern, e.g. id-generator pattern "INV-{year}-{seq:5}", or --preset <name>.');
  }
  return {
    pattern,
    tokens: preset?.tokens ?? {},
    utc: options.local !== true,
    store: options.memory
      ? new MemorySequenceStore()
      : new FileSequenceStore({ path: resolve(io.cwd, options.state ?? DEFAULT_STATE_FILE) }),
    ...(options.scope === undefined ? {} : { scope: options.scope }),
  };
};

const repeat = (count: number, make: () => string): string[] => Array.from({ length: count }, make);

type Command = (
  options: Options,
  positionals: string[],
  io: CliIo,
  format: Format,
  count: number
) => void | Promise<void>;

const commands: Record<string, Command> = {
  uuid: (_options, _positionals, io, format, count) => {
    printIds(io, repeat(count, uuidv4), format);
  },
  uuid7: (_options, _positionals, io, format, count) => {
    printIds(io, repeat(count, uuidv7), format);
  },
  ulid: (_options, _positionals, io, format, count) => {
    printIds(
      io,
      repeat(count, () => ulid()),
      format
    );
  },
  nanoid: (options, _positionals, io, format, count) => {
    const size = toInteger('size', options.size, 21, 1, 256);
    const name = options.alphabet;
    // A known name picks a ready-made alphabet; anything else is taken as the characters themselves.
    const alphabet =
      name !== undefined && Object.hasOwn(alphabets, name) ? alphabets[name as keyof typeof alphabets] : name;
    const make = alphabet === undefined ? () => nanoid(size) : customAlphabet(alphabet, size);
    printIds(
      io,
      repeat(count, () => make()),
      format
    );
  },
  snowflake: (options, _positionals, io, format, count) => {
    const epoch = parseEpoch(options.epoch);
    const generator = createSnowflake({
      workerId: toInteger('worker', options.worker, 0, 0, 1023),
      ...(epoch === undefined ? {} : { epoch }),
    });
    printIds(
      io,
      repeat(count, () => generator.next()),
      format
    );
  },
  pattern: async (options, positionals, io, format, count) => {
    const generator = createPatternGenerator(patternOptions(options, positionals[0], io));
    const values = valuesOf(options);
    if (options.preview) {
      const preview = await generator.preview(values);
      const record = Object.fromEntries(
        preview.tokens.map((token) => [
          token.name,
          token.error === undefined ? (token.value ?? '') : `error: ${token.error}`,
        ])
      );
      printRecord(io, { ...record, id: preview.id ?? '' }, format);
      if (preview.id === undefined) {
        throw new IdGeneratorError('MISSING_VALUE', 'The ID cannot be built yet; see the token errors above.');
      }
      return;
    }
    printIds(io, await generator.generateMany(count, values), format);
  },
  parse: (options, positionals, io, format) => {
    const [id] = positionals;
    if (id === undefined) {
      throw new UsageError(
        'Give the ID to parse, e.g. id-generator parse "INV-2026-00042" --pattern "INV-{year}-{seq:5}".'
      );
    }
    const generator = createPatternGenerator({
      ...patternOptions(options, undefined, io),
      store: new MemorySequenceStore(),
    });
    const parsed = generator.parse(id);
    if (parsed === null) {
      throw new IdGeneratorError('INVALID_VALUE', `"${id}" does not match the pattern ${generator.pattern}.`);
    }
    printRecord(io, parsed, format);
  },
  inspect: (_options, positionals, io, format) => {
    const [id] = positionals;
    if (id === undefined) {
      throw new UsageError('Give the ID to inspect.');
    }
    const result = inspectId(id);
    printRecord(
      io,
      {
        type: result.type,
        ...(result.version === undefined ? {} : { version: String(result.version) }),
        ...(result.timestamp === undefined ? {} : { timestamp: result.timestamp.toISOString() }),
      },
      format
    );
  },
  presets: (_options, _positionals, io, format) => {
    printRecord(
      io,
      Object.fromEntries(Object.entries(presets).map(([name, preset]) => [name, preset.pattern])),
      format
    );
  },
  tokens: (_options, _positionals, io, format) => {
    printRecord(
      io,
      Object.fromEntries(Object.entries(builtInTokens).map(([name, token]) => [`{${name}}`, token.description ?? ''])),
      format
    );
  },
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const parseArguments = (argv: readonly string[]) =>
  parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });

// Help and version need no command; returns an exit code when one of them applies.
const handleMeta = (options: Options, name: string | undefined, io: CliIo): number | undefined => {
  if (options.version) {
    io.stdout(`${__VERSION__}\n`);
    return EXIT.ok;
  }
  if (options.help) {
    io.stdout(HELP);
    return EXIT.ok;
  }
  if (name === undefined) {
    io.stderr(HELP);
    return EXIT.usage;
  }
  return undefined;
};

const runCommand = async (command: Command, options: Options, positionals: string[], io: CliIo): Promise<number> => {
  try {
    await command(options, positionals, io, formatOf(options), toInteger('count', options.count, 1, 1, MAX_COUNT));
    return EXIT.ok;
  } catch (error) {
    io.stderr(`id-generator: ${message(error)}\n`);
    // A ConfigurationError comes from what was typed (pattern, alphabet, epoch), so it is a usage error too.
    return error instanceof UsageError || error instanceof ConfigurationError ? EXIT.usage : EXIT.failure;
  }
};

/** Runs the command line with the given arguments and returns the exit code. */
export const runCli = async (argv: readonly string[], io: CliIo): Promise<number> => {
  let parsed: ReturnType<typeof parseArguments>;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    io.stderr(`id-generator: ${message(error)}\nRun id-generator --help for usage.\n`);
    return EXIT.usage;
  }
  const { values: options, positionals } = parsed;
  const [name, ...rest] = positionals;
  const meta = handleMeta(options, name, io);
  if (meta !== undefined || name === undefined) {
    return meta ?? EXIT.usage;
  }
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (command === undefined) {
    io.stderr(`id-generator: unknown command "${name}". Run id-generator --help for the list.\n`);
    return EXIT.usage;
  }
  return runCommand(command, options, rest, io);
};

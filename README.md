# ID Generator

[![CI](https://github.com/VectoDE/ID-Generator/actions/workflows/ci.yml/badge.svg)](https://github.com/VectoDE/ID-Generator/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/VectoDE/ID-Generator?label=release)](https://github.com/VectoDE/ID-Generator/releases/latest)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/VectoDE/ID-Generator/badge)](https://scorecard.dev/viewer/?uri=github.com/VectoDE/ID-Generator)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue)](LICENSE)

IDs that follow your own pattern, like `INV-2026-00042` or `HKNET#1-2/1234-2026`, plus UUID v4 and v7, ULID,
NanoID-style IDs and Snowflake IDs. TypeScript, no runtime dependencies, and the core runs anywhere Web Crypto exists:
Node.js, browsers, Deno, Bun and edge runtimes.

[Try it in the browser](https://vectode.github.io/ID-Generator/)

```ts
import { createPatternGenerator } from '@vectode/id-generator';

const invoices = createPatternGenerator({ pattern: 'INV-{year}-{seq:5}' });
await invoices.generate(); // 'INV-2026-00001'
await invoices.generate(); // 'INV-2026-00002'
invoices.parse('INV-2026-00042'); // { year: '2026', seq: '00042' }
```

## Contents

- [Install](#install)
- [Standard formats](#standard-formats)
- [Patterns](#patterns)
- [Sequences and stores](#sequences-and-stores)
- [Reading IDs back](#reading-ids-back)
- [Command line](#command-line)
- [Errors](#errors)
- [Runtimes](#runtimes)
- [Performance](#performance)
- [Upgrading from 1.x](#upgrading-from-1x)

## Install

```bash
npm install @vectode/id-generator
```

Node.js 22 or newer. The package ships ESM, CommonJS and type declarations. The unscoped `id-generator` package on
npm belongs to someone else; this one is always `@vectode/id-generator`.

| Import                       | Contains                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| `@vectode/id-generator`      | Everything that runs without Node APIs                         |
| `@vectode/id-generator/node` | The same, plus `FileSequenceStore` for counters in a JSON file |
| `id-generator`, `idgen`      | Command line, see [Command line](#command-line)                |

## Standard formats

```ts
import { createSnowflake, customAlphabet, alphabets, nanoid, ulid, uuidv4, uuidv7 } from '@vectode/id-generator';

uuidv4(); // '9f6db5b9-f8ba-4e36-8368-732c9b9d2692'
uuidv7(); // '01a12f3b-a340-74b2-9caa-8548e4f90219'
ulid(); // '01M4QKQ8T0N455BYTP0QQRQ97K'
nanoid(); // 'WMSUMeYEdxmpyVl5vN4Xg'
customAlphabet(alphabets.readable, 8)(); // 'K7QH4TXC'

const snowflake = createSnowflake({ workerId: 3 });
snowflake.next(); // '367952029286412288'
```

| Format    | Length        | Sorts by creation time | Use it for                                         |
| --------- | ------------- | ---------------------- | -------------------------------------------------- |
| UUID v4   | 36            | No                     | Random IDs where a UUID column is expected         |
| UUID v7   | 36            | Yes                    | Database keys: ordered inserts, still a valid UUID |
| ULID      | 26            | Yes                    | Shorter ordered IDs, readable Base32               |
| NanoID    | 21 by default | No                     | Short random IDs in URLs                           |
| Snowflake | up to 19      | Yes                    | 64-bit integer keys across several workers         |

`uuidv7()` and `ulid()` stay in order within the same millisecond and when the clock goes back a little. Use
`createUuidV7()` or `createUlid()` for a source with its own state or your own clock.

Snowflake IDs are 41 bits of time since an epoch (default 2024-01-01, good until 2093), then a worker number and a
per-millisecond sequence. Every process that generates at the same time needs its own `workerId`. `workerBits`,
`sequenceBits` and `epoch` change the layout; `parse()` and `parseSnowflake()` need the same layout to read an ID.

`collisionProbability({ alphabetSize, size, count })` tells you how likely a duplicate is for random IDs:

```ts
collisionProbability({ alphabetSize: 64, size: 21, count: 1e9 }); // about 6e-21: nanoid() is fine
collisionProbability({ alphabetSize: 23, size: 8, count: 1e6 }); // about 0.998: 8 readable characters are too few
```

Random values come from `crypto.getRandomValues` and are free of modulo bias. Ordered formats (`{seq}`, UUID v7,
ULID, Snowflake) reveal when and in which order IDs were made. Do not use them as secrets or access tokens.

## Patterns

A pattern is text with tokens in braces. `{name}` uses a token, `{name:arg}` passes an argument, `{{` and `}}` are
literal braces.

| Token             | Output                                     | Example                 |
| ----------------- | ------------------------------------------ | ----------------------- |
| `{seq}`           | Next number from the sequence store        | `42`                    |
| `{seq:5}`         | Same, padded to 5 digits                   | `00042`                 |
| `{random}`        | 6 random characters `A-Z0-9`; `{random:8}` | `7KQ2XD`                |
| `{date}`          | `YYYYMMDD`; `{date:YYYY-MM-DD HH:mm}`      | `20261012`              |
| `{year}`          | Four-digit year                            | `2026`                  |
| `{month}` `{day}` | Two digits                                 | `10`                    |
| `{timestamp}`     | Unix milliseconds                          | `1791793800000`         |
| `{uuid}`          | UUID v4                                    |                         |
| `{uuid7}`         | UUID v7                                    |                         |
| `{ulid}`          | ULID                                       |                         |
| `{nanoid}`        | 21 URL-safe characters; `{nanoid:10}`      | `V1StGXR8_Z5jdHi6B-myT` |

Date formats know `YYYY`, `YY`, `MM`, `DD`, `HH`, `mm`, `ss` and `SSS`. Date tokens use UTC unless you pass
`utc: false`, and all of them in one ID read the same moment.

Any other name is a value you pass in:

```ts
const tickets = createPatternGenerator({
  pattern: '{team}-{seq:4}',
  tokens: {
    team: {
      normalize: (value) => value.trim().toUpperCase(),
      validate: /[A-Z]{2,5}/, // must match the whole value
      match: '[A-Z]{2,5}', // used by parse() and matches()
    },
  },
  scope: (values) => String(values.team), // one counter per team
});

await tickets.generate({ team: ' ops ' }); // 'OPS-0001'
await tickets.generate({ team: 'web' }); // 'WEB-0001'
await tickets.generate({ team: 'OPS' }); // 'OPS-0002'
```

The scope function sees the values after normalizing and defaults, plus the text of every other token, so `' ops '`
and `'OPS'` share one counter and `(values) => String(values.year)` works with `{year}`. A token that appears twice in
a pattern, like `{random}-{random}`, has the same value both times.

A value token can also have `required: false`, a `default` (a value or a function of the context) and a
`description`. A token with a `resolve` function computes its own text and replaces a built-in token of the same
name:

```ts
const tokens = { region: { resolve: () => process.env.REGION ?? 'eu' } };
```

Other options of `createPatternGenerator`:

| Option      | Default            | Meaning                                    |
| ----------- | ------------------ | ------------------------------------------ |
| `store`     | new memory store   | Where `{seq}` counters live                |
| `scope`     | the pattern        | Counter name, or a function of the values  |
| `utc`       | `true`             | Date tokens in UTC or local time           |
| `now`       | `() => new Date()` | Clock, handy in tests                      |
| `transform` |                    | Last step, e.g. `(id) => id.toLowerCase()` |
| `maxLength` | `256`              | Longer IDs are rejected                    |

`generateMany(3)` makes three IDs from the same values, `generateMany([{...}, {...}])` one per entry, in order.

`preview(values)` shows what `generate` would return and what each token resolves to, without using up a number.
Tokens that fail are listed with their error instead of throwing:

```ts
await tickets.preview({});
// { id: undefined, tokens: [{ name: 'team', error: 'Missing value for "team".' }, { name: 'seq', value: '0001' }] }
```

### Presets

```ts
import { createPatternGenerator, presets } from '@vectode/id-generator';

const members = createPatternGenerator({ ...presets.club });
await members.generate({ club: 'hk net', role: '1-2', area: '1234' }); // 'HK-NET#1-2/1234-2026'
```

| Preset    | Pattern                       | Example               |
| --------- | ----------------------------- | --------------------- |
| `club`    | `{club}#{role}/{area}-{year}` | `HKNET#1-2/1234-2024` |
| `invoice` | `INV-{year}-{seq:5}`          | `INV-2026-00042`      |
| `order`   | `ORD-{date}-{random}`         | `ORD-20261012-7KQ2XD` |

`club` upper-cases the club and area, cleans up the role and fills in the current year when none is given.

## Sequences and stores

`{seq}` takes the next number from a store. A number is only used up when the rest of the ID is valid, including
`transform` and `maxLength`, so a rejected ID never leaves a gap.

- `MemorySequenceStore` keeps counters in memory. It is the default and starts over with the process.
- `FileSequenceStore` (from `@vectode/id-generator/node`) keeps them in a JSON file, so numbers continue after a
  restart. Several processes can share the file: each change holds a lock file and replaces the file atomically
  after flushing it to disk. A lock left behind by a crashed process is removed after `staleLockMs` (10 s); waiting
  gives up after `lockTimeoutMs` (15 s). A process that stalls longer than `staleLockMs` while holding the lock gets
  `STORE_LOCKED` instead of overwriting newer counters.

```ts
import { FileSequenceStore, createPatternGenerator, presets } from '@vectode/id-generator/node';

const invoices = createPatternGenerator({
  ...presets.invoice,
  store: new FileSequenceStore({ path: './data/invoice-counter.json' }),
  scope: (values) => String(values.year), // starts at 1 every year
});
```

Both stores take `start` (default 1). For a database, implement `SequenceStore` yourself. Methods may return
promises:

```ts
import type { SequenceStore } from '@vectode/id-generator';

const postgresStore: SequenceStore = {
  async next(scope) {
    const { rows } = await db.query(
      `INSERT INTO counters (scope, value) VALUES ($1, 1)
       ON CONFLICT (scope) DO UPDATE SET value = counters.value + 1 RETURNING value`,
      [scope]
    );
    return rows[0].value;
  },
  async peek(scope) {
    const { rows } = await db.query('SELECT value FROM counters WHERE scope = $1', [scope]);
    return (rows[0]?.value ?? 0) + 1;
  },
  async reset(scope) {
    await db.query(
      scope === undefined ? 'DELETE FROM counters' : 'DELETE FROM counters WHERE scope = $1',
      scope === undefined ? [] : [scope]
    );
  },
};
```

## Reading IDs back

```ts
invoices.parse('INV-2026-00042'); // { year: '2026', seq: '00042' }
invoices.matches('INV-26-1'); // false

inspectId(uuidv7()); // { type: 'uuid', version: 7, timestamp: Date }
inspectId(ulid()); // { type: 'ulid', timestamp: Date }
isUuid(value, 4);
isUlid(value);
uuidv7Timestamp(id);
ulidTimestamp(id);
parseSnowflake('367952029286412288'); // { timestamp: Date, workerId: 3, sequence: 0 }
```

`parse` uses the `match` expression of each token; value tokens without one match anything up to the next literal
text. Give value tokens a `match` when you parse untrusted input, so several of them in a row stay fast.

## Command line

```bash
npx @vectode/id-generator uuid7 -n 3
```

Installed, the command is `id-generator` or the shorter `idgen`.

```bash
idgen uuid | uuid7 | ulid                     # standard formats
idgen nanoid --size 10 --alphabet readable    # alphabet name or your own characters
idgen snowflake --worker 3 --epoch 2024-01-01
idgen pattern "INV-{year}-{seq:5}" -n 5
idgen pattern --preset club --set club=HKNET --set role=1-2 --set area=1234
idgen pattern "{team}-{seq:4}" --set team=OPS --preview
idgen parse "INV-2026-00042" --pattern "INV-{year}-{seq:5}"
idgen inspect 01a12f3b-a340-74b2-9caa-8548e4f90219
idgen presets
idgen tokens
```

| Option           | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `-n, --count`    | Number of IDs, 1 to 100000                                         |
| `-f, --format`   | `text`, `json` or `csv`                                            |
| `--state <file>` | Counter file; default `.id-generator-state.json` in this directory |
| `--memory`       | Counters only for this run                                         |
| `--scope <name>` | Counter name instead of the pattern                                |
| `--local`        | Date tokens in local time                                          |
| `--preview`      | Show the next ID per token without counting up                     |

Counters continue across runs because they live in the state file. Exit codes: `0` success, `1` the IDs could not be
made (missing or invalid value, locked or corrupt state file), `2` wrong usage (unknown option, broken pattern,
invalid alphabet or epoch). Output piped into `head` ends quietly.

## Errors

Everything the library throws is an `IdGeneratorError` with a `code`:

| Code                 | When                                                            |
| -------------------- | --------------------------------------------------------------- |
| `INVALID_PATTERN`    | Broken pattern, unknown date format, bad token argument         |
| `INVALID_OPTION`     | An option is out of range                                       |
| `MISSING_VALUE`      | A required value token got nothing                              |
| `INVALID_VALUE`      | A value failed validation, or the ID is empty or too long       |
| `SEQUENCE_OVERFLOW`  | A counter or the ULID random part ran out                       |
| `CLOCK_OVERFLOW`     | The Snowflake time range of the epoch is used up                |
| `STORE_LOCKED`       | `FileSequenceStore` waited longer than `lockTimeoutMs`          |
| `STORE_CORRUPT`      | The counter file is not valid; it is never overwritten silently |
| `CRYPTO_UNAVAILABLE` | No Web Crypto in this environment                               |

`ConfigurationError` (fix your setup) and `ValidationError` (fix the input) extend it.

## Runtimes

The main entry only uses `globalThis.crypto` and standard JavaScript. CI runs the built package on Node 22 and 24
(Linux and Windows), Deno 2 and Bun, and the playground runs it in the browser. Deno can import it with
`npm:@vectode/id-generator`.

## Performance

`npm run bench`, Node 26 on a Windows 11 desktop (x64). Median of five rounds; your numbers will differ.

| Generator                            | IDs per second |
| ------------------------------------ | -------------- |
| `uuidv4()`                           | 4.3 million    |
| `snowflake.next()`                   | 4.0 million    |
| `nanoid()`                           | 3.3 million    |
| `uuidv7()`                           | 1.7 million    |
| `ulid()`                             | 1.3 million    |
| Pattern `INV-{year}-{seq:5}`, memory | 360,000        |
| Club preset                          | 280,000        |
| Pattern with `FileSequenceStore`     | 270            |

The file store pays for a lock and an atomic file replace on every number. Generate in batches or use a database
store when you need more. The benchmark also makes one million IDs per format and checks that all are unique.

## Upgrading from 1.x

Version 1 was never published to npm. Version 2 is a rewrite; the club format still works through the `club`
preset.

| 1.x                                              | 2.x                                                        |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `require('id-generator').createIDGenerator(...)` | `createPatternGenerator(...)` from `@vectode/id-generator` |
| `generator.generate(payload)` returned a string  | `await generator.generate(values)`                         |
| `{sequence}` with `sequence: { padTo: 4 }`       | `{seq:4}`                                                  |
| `sequence: { scope: 'club' }`                    | `scope: (values) => String(values.club)`                   |
| `generateBatch([...])`                           | `generateMany([...])`                                      |
| `preview()` returned a map of values or errors   | `preview()` returns `{ id, tokens }`                       |
| `finalize`                                       | `transform`                                                |
| CLI `--club HKNET --role 1-2 ...`                | `idgen pattern --preset club --set club=HKNET ...`         |
| CLI `--config file.json`                         | Removed; use the API for stored configurations             |
| Node.js 18                                       | Node.js 22                                                 |

## Contributing and security

See [CONTRIBUTING](.github/CONTRIBUTING.md). Report vulnerabilities privately as described in the
[security policy](.github/SECURITY.md). Questions go to [Discussions](https://github.com/VectoDE/ID-Generator/discussions).

## License

[BSD 3-Clause](LICENSE)

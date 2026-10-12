# Architecture

ID Generator is a library with a command line on top. It has no runtime dependencies. The core runs anywhere Web
Crypto exists; everything that needs Node lives behind a separate entry point.

## Entry points

| Import                           | Built from     | Runs in                         | Contents                                               |
| -------------------------------- | -------------- | ------------------------------- | ------------------------------------------------------ |
| `@vectode/id-generator`          | `src/index.ts` | Node, Deno, Bun, browsers, edge | Standard formats, pattern engine, memory store, errors |
| `@vectode/id-generator/node`     | `src/node.ts`  | Node                            | Everything above plus `FileSequenceStore`              |
| `id-generator`, `idgen` (binary) | `src/cli.ts`   | Node                            | Command line                                           |

`tsdown` builds ESM and CommonJS with type declarations for both. `publint` and `@arethetypeswrong/cli` check the
package layout in CI.

## Modules

```text
src/
  random.ts          Web Crypto bytes, a 4 KiB pool for small requests, unbiased random strings
  uuid.ts            UUID v4 and v7 (monotonic), validation, v7 timestamps
  ulid.ts            ULID (monotonic), Crockford Base32
  nanoid.ts          NanoID-style IDs, alphabets, collision probability
  snowflake.ts       Snowflake IDs with a configurable bit layout
  inspect.ts         Tells UUIDs and ULIDs apart and reads their time
  errors.ts          IdGeneratorError, ConfigurationError, ValidationError and their codes
  pattern/
    parser.ts        Pattern text -> literal and token segments
    tokens.ts        Built-in tokens ({seq}, {date}, {random}, {uuid}, ...)
    date.ts          Date formats and their matchers
    generator.ts     createPatternGenerator: generate, preview, parse, matches
    presets.ts       club, invoice, order
    regex.ts         Escaping for matchers
  stores/
    types.ts         SequenceStore interface
    memory.ts        MemorySequenceStore
    file.ts          FileSequenceStore (Node only)
  cli/run.ts         Argument parsing and output (text, JSON, CSV)
```

## How an ID is made

1. `parsePattern` splits the pattern into literal text and tokens once, when the generator is created. Unknown tokens,
   bad arguments and broken braces fail here with `INVALID_PATTERN`.
2. `generate(values)` resolves every token except `{seq}`: values are defaulted, normalized and validated, computed
   tokens read the clock once, so all date tokens agree.
3. The ID is assembled with the next sequence number peeked from the store and checked against `transform` and
   `maxLength`. Only then is the number taken with `store.next(scope)`, so a rejected ID never leaves a gap.
4. `parse` and `matches` use one regular expression built from the same segments, with named groups for the tokens.

## Sequence stores

A store has three async methods: `next`, `peek` and `reset`. The pattern engine only talks to that interface, so a
database store is a few lines (see the README).

`FileSequenceStore` keeps counters in a JSON file shared by several processes. Every change takes a lock file that
carries a random token, writes a temporary file, flushes it and renames it over the old one. A process removes only
a lock that still carries its token and checks the token again before writing, so a stalled process fails with
`STORE_LOCKED` instead of overwriting newer counters. Locks left by crashed processes are moved away after
`staleLockMs`.

## Randomness

All random output comes from `crypto.getRandomValues`. Small requests are served from a 4 KiB pool that is refilled
with a fresh array, so returned bytes are never reused. Random strings mask bytes to the next power of two and reject
values outside the alphabet, so every character is equally likely.

## Quality gates

Every pull request runs lint (typescript-eslint strict type-checked, sonarjs), Prettier, `tsc --noEmit` with TypeScript
6 and 7, Vitest with coverage thresholds, property-based fuzzing, the build, package checks, smoke tests on Deno and
Bun, CodeQL, SonarQube Cloud, dependency review, OSV-Scanner and a secret scan. See `.github/workflows/`.

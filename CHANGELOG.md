# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- Every GitHub release has the package tarball and its signed build attestation (Sigstore, SLSA provenance)
  attached; the same tarball is published to npm with provenance. The security policy explains how to verify it.
- Commits in pull requests must be signed off under the Developer Certificate of Origin, checked by a new workflow.

### Added

- Documentation for the OpenSSF Best Practices badge (passing): architecture, security assurance case, roadmap,
  governance, coding standards and the security response process.
- README badge for OpenSSF Best Practices.

## [2.0.2] - 2026-10-12

### Security

- Date formats in `{date:...}` are checked in linear time. The old check could backtrack exponentially on long formats
  such as `YYYYYYYY...Q` (CodeQL `js/redos`).

### Added

- Property-based tests with fast-check that fuzz the pattern parser, date formats, `inspectId()` and the round trips
  of generated IDs.
- Every change merged into `main` is released automatically to GitHub, npm (with provenance) and GitHub Packages. See
  "Releases" in the contributing guide.

### Changed

- The CI package test unpacks the tarball instead of running `npm install`, so no unpinned install runs in CI.

## [2.0.1] - 2026-10-12

First version on npm, as `@vectode/id-generator`.

### Fixed

- `FileSequenceStore` on Windows no longer fails with `EPERM` when it reads the lock file while another process is
  deleting it. It waits and tries again, as it already did for a busy rename.

### Changed

- The playground announces results through an `<output>` element, which screen readers support more widely than
  `role="status"` on a paragraph.
- The OpenSSF Scorecard workflow asks for `contents: read` instead of `read-all`.
- Releases publish to npm from GitHub Actions through Trusted Publishing, with provenance and without an npm token.
- README badges for the npm version and the SonarQube Cloud quality gate.

## [2.0.0] - 2026-10-12

A rewrite, released on GitHub only. See "Upgrading from 1.x" in the README.

### Added

- Pattern generator with built-in tokens `{seq}`, `{random}`, `{date}`, `{year}`, `{month}`, `{day}`, `{timestamp}`,
  `{uuid}`, `{uuid7}`, `{ulid}` and `{nanoid}`, value tokens with defaults, normalizers and validators, custom
  computed tokens, `transform` and `maxLength`.
- `preview()` that shows every token's value or error without using up a sequence number.
- `parse()` and `matches()` to read values back out of an ID.
- Presets `club` (the 1.x format), `invoice` and `order`.
- Standard formats: UUID v4, UUID v7 (monotonic, RFC 9562), ULID (monotonic), NanoID-style IDs with ready-made
  alphabets, Snowflake IDs with a configurable layout, and `collisionProbability()`.
- `inspectId()`, `isUuid()`, `isUlid()`, `uuidv7Timestamp()`, `ulidTimestamp()` and `parseSnowflake()`.
- Pluggable sequence stores: `MemorySequenceStore`, and `FileSequenceStore` (from `@vectode/id-generator/node`) with a
  lock file and atomic writes for several processes.
- Error classes with machine-readable codes.
- Command line `id-generator` / `idgen` with text, JSON and CSV output, counters that persist across runs, presets,
  `--preview`, `parse` and `inspect`.
- Browser playground on GitHub Pages and benchmarks (`npm run bench`).
- TypeScript types, ESM and CommonJS builds; the core runs in browsers, Deno and Bun.

### Changed

- `generate()` is asynchronous, so stores can live in a database.
- A sequence number is only used when every other token of the ID is valid.
- Node.js 22 or newer is required.

### Removed

- `createIDGenerator`, `generateBatch`, the `{sequence}` token and the CLI flags `--config`, `--club`, `--role`,
  `--area` and `--year`. Their replacements are listed in the README.

## [1.0.0] - 2024

First version, not published to npm.

[Unreleased]: https://github.com/VectoDE/ID-Generator/compare/v2.0.2...HEAD
[2.0.2]: https://github.com/VectoDE/ID-Generator/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/VectoDE/ID-Generator/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/VectoDE/ID-Generator/releases/tag/v2.0.0

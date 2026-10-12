# Security assurance case

Why the security requirements of ID Generator are met. It covers the threat model, the trust boundaries, how secure
design principles are applied and how common weaknesses are countered.

## Security requirements

1. IDs documented as random (`uuidv4`, `nanoid`, `customAlphabet`, `{random}`) are unpredictable.
2. Sequence stores and monotonic generators never hand out the same ID twice when used as documented.
3. Untrusted input passed to `parse()`, `matches()` or `inspectId()` cannot make the library hang or crash the
   process with anything but its own errors.
4. `FileSequenceStore` never loses or corrupts counters, also with several processes and after crashes.
5. Installing and updating the package cannot run third-party code.

## Threat model

| Actor                            | Goal                                         | Requirement |
| -------------------------------- | -------------------------------------------- | ----------- |
| User of an application           | Guess another user's random ID               | 1           |
| Sender of crafted ID strings     | Exhaust CPU through `parse()` or `matches()` | 3           |
| Concurrent or crashing processes | Reuse or lose sequence numbers               | 2, 4        |
| Attacker in the supply chain     | Ship modified code to users of the package   | 5           |

Out of scope: secrecy of ordered IDs. `{seq}`, Snowflake, UUID v7 and ULID are ordered by design and must not be
used as secrets; the README and the security policy say so.

## Trust boundaries

- **Pattern and options** come from the developer and are trusted. They are still validated when a generator is
  created, so mistakes fail early with `ConfigurationError`.
- **Values passed to `generate()`** may come from end users. They are validated and normalized per token; failures
  throw `ValidationError`.
- **ID strings passed to `parse()`, `matches()`, `inspectId()`** may come from anyone. They are only matched against
  regular expressions without nested quantifiers and are bounded by `maxLength`.
- **The counter file** of `FileSequenceStore` is read as untrusted JSON and rejected with `STORE_CORRUPT` when its
  shape is wrong; it is never overwritten silently.
- **The platform** (Web Crypto, file system) is trusted.

## Secure design principles

- **Economy of mechanism:** no runtime dependencies; the core is plain TypeScript over Web Crypto.
- **Fail-safe defaults:** invalid input throws typed errors instead of producing a partial ID; a sequence number is
  only used after the whole ID is valid.
- **Least privilege:** the core needs no file or network access; file access is only in the separate `node` entry.
  CI jobs get read-only tokens unless a step needs more, and the deploy key that pushes release commits is only
  available to a job that runs no dependency code. Version tags can only be created by that workflow, and it only
  publishes tags that point to commits on the protected `main` branch.
- **Complete mediation:** every public function validates its arguments at runtime, also for callers without
  TypeScript.
- **Open design:** all code, tests and the release process are public; security does not rely on hidden details.

## Common weaknesses countered

| Weakness                           | Countermeasure                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CWE-338 weak random numbers        | Only `crypto.getRandomValues`; no `Math.random` anywhere (lint rule)                                                           |
| CWE-330 biased random output       | Masking plus rejection sampling for random strings, tested for even distribution                                               |
| CWE-1333 ReDoS                     | No nested or overlapping quantifiers; date formats checked in linear time; CodeQL `js/redos` on every pull request; fuzz tests |
| CWE-362 race conditions            | Lock file with owner token, token check before write, atomic rename; race tests replay interleavings                           |
| CWE-1321 prototype pollution       | Counters and values are kept in `Map`s; values read with `Object.hasOwn`                                                       |
| CWE-20 improper input validation   | Runtime validation of every option and value with typed errors                                                                 |
| CWE-1357 untrusted components      | Zero runtime dependencies; dev dependencies pinned in the lockfile, scanned by Dependabot, OSV-Scanner and dependency review   |
| CWE-494 download without integrity | Releases are built in GitHub Actions and published with signed SLSA provenance and GitHub attestations                         |

## Evidence

- Tests and coverage: `npm run test:coverage` (thresholds in `vitest.config.ts`), property-based fuzzing in
  `test/properties.test.ts`, lock races in `test/file-lock.test.ts`.
- Static analysis: CodeQL and SonarQube Cloud on every pull request, ESLint with `--max-warnings 0`.
- Supply chain: [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/VectoDE/ID-Generator), pinned
  actions, provenance on npm, [OpenSSF Best Practices](https://www.bestpractices.dev/projects/15415).

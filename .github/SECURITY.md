# Security policy

## Supported versions

| Version | Supported                                                       |
| ------- | --------------------------------------------------------------- |
| 2.x     | Yes, the latest release gets every fix                          |
| 1.x     | No. It was never published to npm; move to 2.x with the README. |

## Reporting a vulnerability

Do not open a public issue. Report privately through
[GitHub Security Advisories](https://github.com/VectoDE/ID-Generator/security/advisories/new).

Please include the affected version, a minimal snippet or command that shows the problem, and the impact as you see
it.

## What happens next

1. You get an answer within 7 days that confirms the report or asks for details.
2. The maintainer reproduces the problem in a private advisory and agrees on a severity with you (CVSS).
3. The fix is developed in the advisory's private fork, with a regression test, and released as a patch version.
   Medium and higher issues are fixed within 60 days, critical ones as fast as possible.
4. The advisory is published with a CVE where one applies, and the changelog lists the fix under "Security".
5. You are credited in the advisory and the changelog, unless you prefer to stay anonymous.

## What counts as a vulnerability

- Predictable output from functions documented as random (`uuidv4`, `nanoid`, `customAlphabet`, `{random}`)
- Duplicate IDs from a sequence store or a monotonic generator used as documented
- Regular expression denial of service in pattern parsing, `parse()` or `matches()`
- Lost or corrupted counters in `FileSequenceStore` under concurrent use

## Not a vulnerability

- Guessable IDs from `{seq}`, Snowflake, UUID v7 or ULID. They are ordered by design and must not be used as secrets
  or access tokens. Use `nanoid()` or `uuidv4()` for values nobody should guess.
- Slow or unsafe patterns, validators or custom tokens written by your own code.

## What you can expect

The [security assurance case](../docs/ASSURANCE.md) explains the threat model, the trust boundaries and how common
weaknesses are countered. In short: random IDs come from Web Crypto only, input from outside is validated and
length-limited before any regular expression sees it, and the package has no runtime dependencies.

## Verifying a release

From 2.0.2 on, releases are built and published only by the [release workflow](workflows/release.yml), never from
a laptop. 2.0.1, the first npm version, was published by hand and has no provenance; use a later version.

- **npm:** every version carries a signed SLSA provenance statement that names this repository, the workflow and the
  commit. Check the installed packages with `npm audit signatures`, or look for "Provenance" on
  [npmjs.com](https://www.npmjs.com/package/@vectode/id-generator).
- **GitHub releases:** each release has the package tarball and its signed build attestation attached. Verify a
  downloaded tarball with the GitHub CLI:

  ```bash
  gh attestation verify vectode-id-generator-<version>.tgz --repo VectoDE/ID-Generator
  ```

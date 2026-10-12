# Security policy

## Supported versions

| Version | Supported                                                       |
| ------- | --------------------------------------------------------------- |
| 2.x     | Yes                                                             |
| 1.x     | No. It was never published to npm; move to 2.x with the README. |

## Reporting a vulnerability

Do not open a public issue. Report privately through
[GitHub Security Advisories](https://github.com/VectoDE/ID-Generator/security/advisories/new).

Please include the affected version, a minimal snippet or command that shows the problem, and the impact as you see
it. You get an answer within 7 days. Confirmed issues are fixed in a patch release and published as an advisory with
credit, unless you prefer to stay anonymous.

## What counts as a vulnerability

- Predictable output from functions documented as random (`uuidv4`, `nanoid`, `customAlphabet`, `{random}`)
- Duplicate IDs from a sequence store or a monotonic generator used as documented
- Regular expression denial of service in pattern parsing, `parse()` or `matches()`
- Lost or corrupted counters in `FileSequenceStore` under concurrent use

## Not a vulnerability

- Guessable IDs from `{seq}`, Snowflake, UUID v7 or ULID. They are ordered by design and must not be used as secrets
  or access tokens. Use `nanoid()` or `uuidv4()` for values nobody should guess.
- Slow or unsafe patterns, validators or custom tokens written by your own code.

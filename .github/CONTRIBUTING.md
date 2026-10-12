# Contributing

Thanks for helping. Bug reports, fixes, new tokens and documentation improvements are welcome.

## Before you start

- Security problems go through the [security policy](SECURITY.md), not through issues.
- For new public API, open an issue first so we can agree on names and behaviour.

## Setup

```bash
git clone https://github.com/VectoDE/ID-Generator.git
cd ID-Generator
npm ci
npm test
```

Node.js 22 or newer is required (`.nvmrc` pins 22).

| Command                  | What it does                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| `npm test`               | Runs the test suite once                                              |
| `npm run test:coverage`  | Tests with coverage; fails below the thresholds                       |
| `npm run build`          | Builds ESM, CommonJS, types and the CLI into `dist/`                  |
| `npm run dev:playground` | Serves the playground on http://localhost:5173                        |
| `npm run bench`          | Builds and runs the benchmarks                                        |
| `npm run check`          | Everything CI runs: lint, format, types, tests, build, package checks |

## Layout

- `src/` is the isomorphic core. It only uses Web Crypto and standard JavaScript, so it runs in browsers, Deno, Bun
  and edge runtimes.
- `src/stores/file.ts`, `src/node.ts` and `src/cli/` use Node APIs. They are only reachable through
  `@vectode/id-generator/node` and the `id-generator` binary.
- `playground/` is the browser demo, `bench/` holds the benchmarks.

## Making a change

1. Branch from `main`: `fix/short-name` or `feat/short-name`.
2. Add or update tests. A bug fix comes with a test that fails without it.
3. Document public API with TSDoc and in the README; add an entry under "Unreleased" in `CHANGELOG.md`.
4. Run `npm run check`.

## Commits and pull requests

- Write commit messages in English, imperative mood, and explain why: `Keep seq unused when a value fails`.
- One topic per pull request. Fill in the template.
- The package has no runtime dependencies. Keep it that way unless there is a strong reason.
- CI must be green before review.

## License

By contributing you agree that your contribution is licensed under the [BSD 3-Clause License](../LICENSE).

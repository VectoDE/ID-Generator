# Roadmap

What the project plans for the next twelve months. Plans change; the current state is always in the
[issues](https://github.com/VectoDE/ID-Generator/issues) and the [changelog](../CHANGELOG.md). Ideas and objections
are welcome in [Discussions](https://github.com/VectoDE/ID-Generator/discussions).

## Ongoing

- Security and dependency updates as they come out, released within days. Supported versions are listed in the
  [security policy](../.github/SECURITY.md).
- Keep the package working on every active Node.js LTS line, current Deno and Bun, and evergreen browsers.
- No runtime dependencies, so installing the package never pulls in third-party code.

## 2.x

- More ready-made presets for common business documents, driven by requests in issues.
- Store examples for common databases (PostgreSQL, SQLite, Redis) in the README, with tests against real servers.
- A batch API that takes several sequence numbers in one store call, for faster bulk generation with
  `FileSequenceStore` and database stores.

## Not planned

- Runtime dependencies or a plugin system that loads third-party code.
- Formats that are deprecated or unsafe as identifiers, such as UUID v1 with a real MAC address.

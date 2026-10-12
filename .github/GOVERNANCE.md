# Governance

ID Generator is maintained by [VectoDE](https://github.com/VectoDE). This page says who decides what, how changes get
in, and how the project keeps going if the maintainer is gone.

## Roles

| Role        | Who                                                       | Responsibilities                                                                                                          |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Maintainer  | [@VectoDE](https://github.com/VectoDE)                    | Reviews and merges pull requests, triages issues, answers security reports, owns the release workflow and the npm package |
| Contributor | Anyone who opens an issue, a discussion or a pull request | Follows the [contributing guide](CONTRIBUTING.md), the [code of conduct](CODE_OF_CONDUCT.md) and signs off commits (DCO)  |

A contributor with a record of good pull requests can be invited as a second maintainer. The invitation is a pull
request that adds them to this file and to [CODEOWNERS](CODEOWNERS).

## Decisions

- Bug fixes and small changes: a pull request that passes every required check and is approved by a maintainer.
- New public API or breaking changes: discussed in an issue first, then decided by the maintainers. The reasoning is
  written down in the issue, so later readers can see why.
- Security reports follow the [security policy](SECURITY.md) and are handled privately until a fix is released.

## Releases

Every change merged into `main` is released by the [release workflow](workflows/release.yml), which publishes to
GitHub, npm and GitHub Packages with signed provenance. Nobody publishes from a laptop. See "Releases" in the
[contributing guide](CONTRIBUTING.md#releases).

## Continuity

The project must keep working if a maintainer can no longer act:

- The code, issues, discussions, releases and the full history are public on GitHub, so anyone can fork and continue.
- Publishing needs no personal token: npm trusts the release workflow of this repository through OIDC.
- Repository, npm package and the `@vectode` scope belong to the maintainer account. Access for a second person is
  arranged by the maintainer and recorded here when it exists.

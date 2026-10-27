# Versioning and changelogs

Use conventional commit titles and a body describing the change, reason and verification. Add a short user-facing entry under `## Unreleased` in CHANGELOG.md in the same commit. Use Features, Fixes, Refactors, Docs or CI & Build. Fixes and Refactors describe published code; changes to unreleased work update its Features entry. Preserve published sections.

The Release workflow runs manually on main. `feat` selects minor, `fix` or `perf` patch, and `!` or a BREAKING CHANGE footer major. Several commits use the largest bump. Other types do not independently trigger releases. A version input overrides selection. Do not bump versions by hand.

`dart run tool/prepare_release.dart --check` previews without edits. With `--notes`, the helper updates Flutter build number and Python/package metadata together, and cuts Unreleased into a dated section. GitHub notes contain those curated entries and a Full Changelog link, following collectarr-app.

Use rebase merging for multi-commit pull requests to preserve conventional messages. The Release workflow publishes the release commit, tag, artifacts and images after checks. Preparing this branch does not publish a release.

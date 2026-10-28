# Versioning and changelogs

Use conventional commit titles and a body describing the change, reason and verification. Add a short user-facing entry under `## Unreleased` in CHANGELOG.md in the same commit. Use Features, Fixes, Refactors, Docs or CI & Build. Fixes and Refactors describe published code; changes to unreleased work update its Features entry. Preserve published sections.

The Release workflow runs manually on main. `feat` selects minor, `fix` or `perf` patch, and `!` or a BREAKING CHANGE footer major. Several commits use the largest bump. Other types do not independently trigger releases. A version input overrides selection. Do not bump versions by hand.

Start Unreleased with a short overview, then group changes by user benefit using bold bullet labels within Features, Fixes, Refactors, Docs or CI & Build. Add known limitations when relevant. Keep incompatible installation requirements prominent. This follows the reader-oriented structure of [Floppy releases](https://github.com/dannyvfilms/Floppy/releases), with curated changes rather than a raw commit list.

`dart run tool/prepare_release.dart --check` previews the complete release notes without edits. With `--notes`, the helper updates Flutter build number and Python/package metadata together, and cuts Unreleased into a dated section. GitHub notes include those entries, installation and deployment links, project/support information and a Full Changelog link. Published changelog sections are preserved.

Use rebase merging for multi-commit pull requests to preserve conventional messages. The Release workflow publishes the release commit, tag, artifacts and images after checks. Its preparation checkout uses the existing `RELEASE_PAT` repository secret so the authorized release actor can push the release commit to protected main. Android signing secrets are optional; without them, the workflow attaches an explicitly named debug APK. Preparing a branch does not publish a release.

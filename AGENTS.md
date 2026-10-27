# Working rules

- Follow the user's instructions over this file.
- Use conventional commit titles. For real changes, add a body explaining what
  changed, why, and how it was checked. Keep each commit to one coherent change.
- Update `CHANGELOG.md` under `Unreleased` in the same commit: one short,
  user-facing line in Features, Fixes, Refactors, Docs, or CI & Build. Describe
  the effect. The Release workflow turns these entries into release notes.
- Fixes and Refactors entries only describe behavior or code that shipped in a
  published release. For unreleased work, update its Features entry instead.
  Check `git show <last tag>:<path>` when unsure.
- Release through the Release workflow on `main`; do not bump versions or tag
  by hand. Breaking commits must use `!` or a `BREAKING CHANGE:` footer.
- Rebase and merge pull requests with several commits so their conventional
  commits reach `main`. Squash only single-change pull requests.
- Run `dart run tool/ci_check.dart` before pushing. Add `--integration` for the
  disposable Docker/API and browser acceptance checks.
- No legacy support, compatibility layers, deprecated aliases, or dead code.
- The Python server is a new schema baseline. After it ships, change schemas
  with explicit ordered migrations from the last released schema. Fold
  unreleased schema changes into the baseline; do not preserve intermediate
  development schemas. Never reset a real database to make an upgrade work.
- Never modify live databases or backups. Use isolated test storage. Scripts
  and tools must never delete, reset, or seed the user's real database.
- Do not rewrite history or replace published tags without an explicit request.
- Update the living document for a topic; do not add dated audit, plan, or QA
  reports. Delete superseded documentation.
- Keep scratch files, logs, and captures out of Git.
- Flutter owns the active UI. Python owns the API, persistence, and workers.
  Kotlin is limited to the Android WhatsApp provider and platform bridge.
- Preserve the original logo at `assets/brand/sticker-foundry-icon.png`; derive
  platform icons with the brand tool. Do not replace its artwork.
- The server is the source of truth. Scope downloads to their server/account;
  remove private downloads on sign-out or lost access.
- Keep permission checks on the server. Check media dimensions, frame counts,
  upload sizes, archive paths, and export limits before expensive processing.

## Token efficiency

- Search with `rg` before reading; retrieve only relevant lines.
- Keep tool output short. Do not dump large files, logs, or directories.
- Inspect changes with `git diff` instead of repeatedly reading whole files.
- Run focused tests first; broaden checks when a failure or risk justifies it.
- Preserve important findings across context compaction.

import 'package:flutter_test/flutter_test.dart';

import '../../../tool/release/release_preparation.dart';

void main() {
  group('releaseBumpFor', () {
    test('takes the largest bump among conventional commits', () {
      expect(releaseBumpFor(['docs: notes', 'chore: tidy']), isNull);
      expect(releaseBumpFor(['fix(ui): click', 'docs: x']), ReleaseBump.patch);
      expect(releaseBumpFor(['perf: faster']), ReleaseBump.patch);
      expect(releaseBumpFor(['fix: a', 'feat(add): b']), ReleaseBump.minor);
      expect(releaseBumpFor(['feat(app)!: cut over']), ReleaseBump.major);
      expect(
        releaseBumpFor(['fix: a\n\nBREAKING CHANGE: storage moved']),
        ReleaseBump.major,
      );
      expect(releaseBumpFor(['Merge branch main', 'update deps']), isNull);
    });
  });

  test('nextVersion raises one part and resets the smaller ones', () {
    expect(nextVersion('1.1.0', ReleaseBump.patch), '1.1.1');
    expect(nextVersion('1.1.3', ReleaseBump.minor), '1.2.0');
    expect(nextVersion('1.4.2', ReleaseBump.major), '2.0.0');
    expect(() => nextVersion('1.2', ReleaseBump.patch), throwsFormatException);
  });

  test('bumpPubspecVersion sets the version and raises the build number', () {
    const pubspec = 'name: app\nversion: 1.1.0+2\nenvironment:\n';
    expect(
      bumpPubspecVersion(pubspec, '1.2.0'),
      'name: app\nversion: 1.2.0+3\nenvironment:\n',
    );
    expect(
      bumpPubspecVersion('version: 0.1.0\n', '0.2.0'),
      'version: 0.2.0+1\n',
    );
  });

  group('cutChangelog', () {
    const changelog =
        '# Changelog\n\n## Unreleased\n\n### ✨ Features\n'
        '- Adds a thing.\n\n## 1.1.0 - 2026-10-16\n\n### 🐛 Fixes\n- Old.\n';

    test('moves Unreleased entries under a dated version heading', () {
      final cut = cutChangelog(changelog, '1.2.0', '2026-10-20');
      expect(cut.entries, '### ✨ Features\n- Adds a thing.');
      expect(
        cut.changelog,
        '# Changelog\n\n## Unreleased\n\n## 1.2.0 - 2026-10-20\n\n'
        '### ✨ Features\n- Adds a thing.\n\n'
        '## 1.1.0 - 2026-10-16\n\n### 🐛 Fixes\n- Old.\n',
      );
    });

    test('refuses a release without Unreleased entries', () {
      expect(
        () => cutChangelog(
          '# Changelog\n\n## Unreleased\n\n## 1.1.0 - x\n- Old.\n',
          '1.2.0',
          '2026-10-20',
        ),
        throwsFormatException,
      );
    });
  });

  test('releaseNotes link repository files at the tag and compare tags', () {
    final notes = releaseNotes(
      entries:
          '### 📚 Docs\n- See the [report](docs/architecture.md) and '
          '[site](https://example.org).',
      version: '1.2.0',
      previousTag: 'v1.1.0',
      repository: 'saitatter/sticker-foundry',
    );
    expect(notes, startsWith('## Changes since last release\n\n'));
    expect(
      notes,
      contains(
        '### 📚 Docs\n- See the '
        '[report](https://github.com/saitatter/sticker-foundry/blob/v1.2.0/'
        'docs/architecture.md) and [site](https://example.org).',
      ),
    );
    expect(notes, contains('## Installing & Updating'));
    expect(notes, contains('/blob/v1.2.0/README.md'));
    expect(notes, contains('STICKER_FOUNDRY_VERSION=1.2.0'));
    expect(notes, contains('## About Sticker Foundry'));
    expect(
      notes,
      endsWith(
        '**Full Changelog**: https://github.com/saitatter/sticker-foundry/'
        'compare/v1.1.0...v1.2.0\n',
      ),
    );
  });
}

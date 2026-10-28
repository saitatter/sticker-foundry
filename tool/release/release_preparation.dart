/// Pure release steps behind `tool/prepare_release.dart`.
library;

enum ReleaseBump { patch, minor, major }

final _header = RegExp(r'^(\w+)(\([^)]*\))?(!)?:');

/// The bump that conventional commit [messages] call for, or null when none
/// of them is releasable (docs, chores, CI and similar).
ReleaseBump? releaseBumpFor(Iterable<String> messages) {
  ReleaseBump? bump;
  for (final message in messages) {
    final match = _header.firstMatch(message.trimLeft());
    if (match == null) continue;
    final next =
        match.group(3) != null ||
            RegExp(r'^BREAKING[ -]CHANGE:', multiLine: true).hasMatch(message)
        ? ReleaseBump.major
        : switch (match.group(1)) {
            'feat' => ReleaseBump.minor,
            'fix' || 'perf' => ReleaseBump.patch,
            _ => null,
          };
    if (next != null && (bump == null || next.index > bump.index)) {
      bump = next;
    }
  }
  return bump;
}

/// [version] (`MAJOR.MINOR.PATCH`) raised by [bump].
String nextVersion(String version, ReleaseBump bump) {
  final parts = version.split('.').map(int.parse).toList();
  if (parts.length != 3) {
    throw FormatException('Expected MAJOR.MINOR.PATCH, got "$version".');
  }
  return switch (bump) {
    ReleaseBump.major => '${parts[0] + 1}.0.0',
    ReleaseBump.minor => '${parts[0]}.${parts[1] + 1}.0',
    ReleaseBump.patch => '${parts[0]}.${parts[1]}.${parts[2] + 1}',
  };
}

/// [pubspec] with `version:` set to [version] and the build number raised.
String bumpPubspecVersion(String pubspec, String version) {
  final line = RegExp(r'^version: *(\S+) *$', multiLine: true);
  final match = line.firstMatch(pubspec);
  if (match == null) throw const FormatException('pubspec has no version.');
  final build = int.tryParse(
    match.group(1)!.split('+').elementAtOrNull(1) ?? '',
  );
  return pubspec.replaceRange(
    match.start,
    match.end,
    'version: $version+${(build ?? 0) + 1}',
  );
}

/// The changelog after a release, and the released entries.
typedef ChangelogCut = ({String changelog, String entries});

/// Moves the entries under "## Unreleased" into a dated [version] section and
/// leaves an empty Unreleased heading for the next changes.
ChangelogCut cutChangelog(String changelog, String version, String date) {
  const unreleased = '## Unreleased';
  final start = changelog.indexOf(unreleased);
  if (start < 0) throw const FormatException('CHANGELOG has no Unreleased.');
  final bodyStart = start + unreleased.length;
  final next = changelog.indexOf(RegExp(r'^## ', multiLine: true), bodyStart);
  final bodyEnd = next < 0 ? changelog.length : next;
  final entries = changelog.substring(bodyStart, bodyEnd).trim();
  if (!entries.contains(RegExp(r'^- ', multiLine: true))) {
    throw const FormatException('CHANGELOG has no Unreleased entries.');
  }
  return (
    changelog:
        '${changelog.substring(0, start)}$unreleased\n\n'
        '## $version - $date\n\n$entries\n\n${changelog.substring(bodyEnd)}',
    entries: entries,
  );
}

/// GitHub release notes for [version] from its changelog [entries].
String releaseNotes({
  required String entries,
  required String version,
  required String previousTag,
  required String repository,
}) =>
    '## Changes since last release\n\n'
    "${entries.replaceAllMapped(RegExp(r'\]\((?!https?:|#)([^)]+)\)'), (match) => '](https://github.com/$repository/blob/v$version/${match[1]})')}\n\n"
    '## Installing & Updating\n\n'
    'Download the Android APK or Windows, macOS and Linux archives from the assets below. '
    'If Android signing is not configured, the APK is explicitly named `sticker-foundry-android-debug.apk`. '
    'The server archive includes the Docker deployment files; the web archive contains the browser client.\n\n'
    'For installation, compatibility requirements and server configuration, see the '
    '[README](https://github.com/$repository/blob/v$version/README.md) and '
    '[deployment guide](https://github.com/$repository/blob/v$version/docs/DEPLOY_SERVER.md). '
    'Pin published container images with `STICKER_FOUNDRY_VERSION=$version`.\n\n'
    '## About Sticker Foundry\n\n'
    'Sticker Foundry is an open-source, self-hosted workspace for creating, editing and sharing sticker packs. '
    'Flutter provides the mobile, desktop and web interface; Python runs the API and media workers.\n\n'
    'Report problems and suggest improvements through '
    '[GitHub Issues](https://github.com/$repository/issues). '
    'You can support development on [Ko-fi](https://ko-fi.com/saitatter).\n\n'
    '**Full Changelog**: https://github.com/$repository/compare/$previousTag...v$version\n';

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'release preview is read-only and preparation synchronizes every manifest',
    () {
      final root = Directory.current.parent.parent;
      final sandbox = Directory.systemTemp.createTempSync(
        'foundry-release-test-',
      );
      final script = '${root.path}/tool/prepare_release.dart';
      const files = [
        'apps/client/pubspec.yaml',
        'apps/backend/pyproject.toml',
        'apps/backend/uv.lock',
        'package.json',
        'package-lock.json',
      ];
      ProcessResult run(String binary, List<String> args) {
        final result = Process.runSync(
          binary,
          args,
          workingDirectory: sandbox.path,
          runInShell: Platform.isWindows,
        );
        expect(
          result.exitCode,
          0,
          reason: '${result.stdout}\n${result.stderr}',
        );
        return result;
      }

      try {
        for (final name in files) {
          final target = File('${sandbox.path}/$name');
          target.parent.createSync(recursive: true);
          File('${root.path}/$name').copySync(target.path);
        }
        final changelog = File('${sandbox.path}/CHANGELOG.md')
          ..writeAsStringSync(
            '# Changelog\n\n## Unreleased\n\n### Features\n\n- New server.\n',
          );
        run('git', ['init']);
        run('git', ['config', 'user.name', 'Release test']);
        run('git', ['config', 'user.email', 'release@example.test']);
        run('git', ['add', '.']);
        run('git', ['commit', '-m', 'chore: baseline']);
        run('git', ['tag', 'v1.3.0']);
        run('git', ['commit', '--allow-empty', '-m', 'feat(api)!: new server']);
        final before = {
          for (final name in [...files, 'CHANGELOG.md'])
            name: File('${sandbox.path}/$name').readAsStringSync(),
        };
        final preview = run('dart', ['run', script, '--check']);
        expect(preview.stdout, contains('v2.0.0'));
        for (final entry in before.entries) {
          expect(
            File('${sandbox.path}/${entry.key}').readAsStringSync(),
            entry.value,
          );
        }
        run('dart', ['run', script, '--notes', '${sandbox.path}/notes.md']);
        expect(
          File('${sandbox.path}/apps/client/pubspec.yaml').readAsStringSync(),
          contains('version: 2.0.0+'),
        );
        expect(
          File('${sandbox.path}/apps/backend/pyproject.toml')
              .readAsStringSync(),
          contains('version = "2.0.0"'),
        );
        expect(
          File('${sandbox.path}/apps/backend/uv.lock')
              .readAsStringSync()
              .replaceAll('\r\n', '\n'),
          contains('name = "sticker-foundry-backend"\nversion = "2.0.0"'),
        );
        for (final name in ['package.json', 'package-lock.json']) {
          final value = jsonDecode(
            File('${sandbox.path}/$name').readAsStringSync(),
          );
          expect(value['version'], '2.0.0');
          if (name.endsWith('lock.json')) {
            expect(value['packages']['']['version'], '2.0.0');
          }
        }
        expect(changelog.readAsStringSync(), contains('## 2.0.0 - '));
        expect(
          File('${sandbox.path}/notes.md').readAsStringSync(),
          contains('v1.3.0...v2.0.0'),
        );
      } finally {
        sandbox.deleteSync(recursive: true);
      }
    },
  );
}

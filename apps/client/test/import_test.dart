import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/importing/session.dart';
import 'package:sticker_foundry/importing/source.dart';

class ImportStore extends FoundryStore {
  final uploads = <String>[];
  int packsCreated = 0;
  bool failNext = false;
  ApiError? rejectNext;
  void Function()? afterUpload;
  ImportStore() {
    user = {'id': 'qa'};
    api = FoundryApi(
      'http://example.test/api/',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/inspect')) {
          final id = int.parse(
            RegExp(r'filename="(\d+)').firstMatch(request.body)!.group(1)!,
          );
          return http.Response(
            jsonEncode({
              'sha256': '$id',
              'animated': id >= 100,
              'width': 64,
              'height': 64,
              'thumbnail': '',
            }),
            200,
          );
        }
        expect(request.url.path, '/api/packs');
        final data = jsonDecode(request.body) as Map<String, dynamic>;
        packsCreated++;
        return http.Response(
          jsonEncode({...data, 'id': 'pack-$packsCreated'}),
          201,
        );
      }),
    );
  }
  @override
  Future<void> importSticker(
    String packId,
    Uint8List bytes,
    String filename,
  ) async {
    if (rejectNext != null) {
      final error = rejectNext!;
      rejectNext = null;
      throw error;
    }
    if (failNext) {
      failNext = false;
      throw StateError('Connection interrupted');
    }
    uploads.add('$packId:$filename');
    afterUpload?.call();
  }

  @override
  Future<void> refresh({
    Duration timeout = const Duration(seconds: 90),
  }) async {}
}

ImportSource source(int id) =>
    ImportSource('$id.webp', 1, () async => Uint8List.fromList([id]));

void main() {
  test('server rate limits wait before retry and can be stopped', () async {
    final store = ImportStore()
      ..rejectNext = ApiError(429, 'Too many requests', retryAfterSeconds: 2);
    var seconds = 0;
    final session = ImportSession(
      store,
      wait: (_) async {
        seconds++;
      },
    );
    await session.analyze(ImportSelection([source(1)]));
    await session.importSelected('Found', 'QA');
    expect(seconds, 2);
    expect(session.imported, 1);
    expect(store.uploads.length, 1);
    store.rejectNext = ApiError(
      429,
      'Too many requests',
      retryAfterSeconds: 60,
    );
    late ImportSession stopped;
    stopped = ImportSession(
      store,
      wait: (_) async {
        stopped.stop();
      },
    );
    await stopped.analyze(ImportSelection([source(2)]));
    await stopped.importSelected('Found', 'QA');
    expect(stopped.imported, 0);
    expect(stopped.selected.length, 1);
    expect(stopped.busy, isFalse);
  });
  test(
    'inspection skips duplicates and unreadable files before creating packs',
    () async {
      final store = ImportStore();
      final session = ImportSession(store);
      await session.analyze(
        ImportSelection([
          source(1),
          source(1),
          source(100),
          ImportSource(
            'huge.webp',
            importByteLimit + 1,
            () async => throw StateError('Must not read'),
          ),
        ]),
      );
      expect(session.selected.length, 2);
      expect(session.duplicates, 1);
      expect(session.files.last.error, contains('10 MB'));
      expect(store.packsCreated, 0);
      await session.importSelected('Found', 'QA');
      expect(store.packsCreated, 2);
      expect(store.uploads, ['pack-1:1.webp', 'pack-2:100.webp']);
      expect(session.created.map((p) => p['isAnimated']), [false, true]);
    },
  );

  test(
    '31 static images split at 30 and successful files are not retried',
    () async {
      final store = ImportStore();
      final session = ImportSession(store);
      await session.analyze(
        ImportSelection([for (var i = 1; i <= 31; i++) source(i)]),
      );
      expect(session.packCount(false), 2);
      await session.importSelected('Found', 'QA');
      expect(store.uploads.where((v) => v.startsWith('pack-1:')).length, 30);
      expect(store.uploads.last, 'pack-2:31.webp');
      await session.importSelected('Found', 'QA');
      expect(store.uploads.length, 31);
    },
  );

  test(
    'partial failures and stop preserve completed imports for retry',
    () async {
      final store = ImportStore()..failNext = true;
      final session = ImportSession(store);
      await session.analyze(ImportSelection([source(1), source(2), source(3)]));
      store.afterUpload = session.stop;
      await session.importSelected('Found', 'QA');
      expect(session.imported, 1);
      expect(session.selected.length, 2);
      expect(session.files.first.error, contains('Connection interrupted'));
      store.afterUpload = null;
      await session.importSelected('Found', 'QA');
      expect(session.imported, 3);
      expect(store.packsCreated, 1);
      expect(store.uploads, [
        'pack-1:2.webp',
        'pack-1:1.webp',
        'pack-1:3.webp',
      ]);
    },
  );

  test('a changed account prevents further uploads', () async {
    final store = ImportStore();
    final session = ImportSession(store);
    await session.analyze(ImportSelection([source(1), source(2)]));
    store.afterUpload = () {
      store.user = {'id': 'other-account'};
    };
    await session.importSelected('Found', 'QA');
    expect(store.uploads.length, 1);
  });
}

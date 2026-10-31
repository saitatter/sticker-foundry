import 'dart:async';
import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/ui/app.dart';
import 'package:sticker_foundry/ui/activity_panel.dart';
import 'package:sticker_foundry/ui/pack.dart';
import 'package:sticker_foundry/ui/sticker_grid.dart';

import 'client_test.dart' show TestStore, MemoryCache;

class InterruptedCache extends MemoryCache {
  bool fail = false;
  @override
  Future<void> write(String key, Uint8List bytes) async {
    if (fail && key.contains('revision-')) throw StateError('Disk full');
    await super.write(key, bytes);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('com.stickerfoundry.app/native'),
          (_) async => null,
        );
  });

  FoundryStore syncedStore(
    MemoryCache cache, {
    Completer<void>? blocked,
    Completer<void>? requested,
  }) {
    final zip = ZipEncoder().encode(
      Archive()..addFile(ArchiveFile('s.webp', 1, [2])),
    );
    return FoundryStore(cache: cache)
      ..user = {'id': 'u'}
      ..api = FoundryApi(
        'http://example.test/api/',
        client: MockClient((r) async {
          if (r.url.path.endsWith('sync/packs')) {
            return http.Response(
              '{"packs":[{"id":"p","canExport":true,"syncHash":"new"}]}',
              200,
            );
          }
          if (r.url.path.endsWith('/export')) {
            requested?.complete();
            if (blocked != null) await blocked.future;
            return http.Response.bytes(zip, 200);
          }
          if (r.url.path.endsWith('packs/p')) {
            return http.Response('{"id":"p","imageDataVersion":"2"}', 200);
          }
          return http.Response('[]', 200);
        }),
      );
  }

  test(
    'interrupted sync keeps the previous complete cache and index',
    () async {
      final cache = InterruptedCache();
      final store = syncedStore(cache);
      store.cached['p'] = {
        'id': 'p',
        '_assets': ['s.webp'],
        '_syncHash': 'old',
        '_assetRoot': 'p',
      };
      await cache.write('p/s.webp', Uint8List.fromList([1]));
      await cache.write('index.json', Uint8List.fromList([9]));
      cache.fail = true;
      await expectLater(store.sync(), throwsStateError);
      expect(store.cached['p']!['_syncHash'], 'old');
      expect(await cache.read('p/s.webp'), [1]);
      expect(await cache.read('index.json'), [9]);
      cache.fail = false;
      await store.sync();
      expect(store.cached['p']!['_syncHash'], 'new');
      expect(await cache.read('p/s.webp'), isNull);
      expect(await cache.read('${store.cached['p']!['_assetRoot']}/s.webp'), [
        2,
      ]);
    },
  );

  test(
    'account switch during export cannot publish private downloads',
    () async {
      final blocked = Completer<void>(),
          requested = Completer<void>(),
          cache = MemoryCache();
      final store = syncedStore(cache, blocked: blocked, requested: requested);
      final sync = store.sync();
      await requested.future;
      store.user = {'id': 'other'};
      final clear = store.clearCache();
      blocked.complete();
      await Future.wait([sync, clear]);
      expect(store.cached, isEmpty);
      expect(cache.values, isEmpty);
    },
  );

  test('library refresh cannot publish a previous account response', () async {
    final response = Completer<http.Response>();
    final store = TestStore()
      ..user = {'id': 'previous'}
      ..api = FoundryApi(
        'http://example.test/api/',
        client: MockClient((_) => response.future),
      );
    final refresh = store.refresh();
    store.user = {'id': 'new'};
    response.complete(http.Response('[{"id":"private"}]', 200));
    await refresh;
    expect(store.packs, isEmpty);
  });

  testWidgets(
    'protected destinations resume after login; reset remains public',
    (tester) async {
      final store = TestStore()
        ..initialized = true
        ..api = FoundryApi(
          'http://example.test/api/',
          client: MockClient(
            (r) async => http.Response(
              r.url.path.endsWith('/packs/p')
                  ? '{"id":"p","name":"Pack","publisher":"Artist","stickers":[],"canEdit":true}'
                  : '[]',
              200,
            ),
          ),
        );
      final router = createFoundryRouter(
        store,
        initialLocation: '/app/packs/p/stickers',
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, '/login');
      expect(
        router.routeInformationProvider.value.uri.queryParameters['next'],
        '/app/packs/p/stickers',
      );
      store.user = {'id': 'u'};
      store.changed();
      await tester.pumpAndSettle();
      expect(
        router.routeInformationProvider.value.uri.path,
        '/app/packs/p/stickers',
      );
      router.go('/reset-password?token=test');
      await tester.pumpAndSettle();
      expect(find.text('Reset password'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'pack keyboard selects a range and persists bulk review changes',
    (tester) async {
      final writes = <Map<String, dynamic>>[];
      final rows = [
        for (var i = 1; i <= 3; i++)
          {'id': 's$i', 'fileName': 's$i.webp', 'reviewStatus': 'PENDING'},
      ];
      final store = TestStore()..user = {'id': 'u'};
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient((r) async {
          if (r.method == 'PATCH') {
            writes.add({'path': r.url.path, ...object(jsonDecode(r.body))});
            return http.Response('{}', 200);
          }
          if (r.url.path.endsWith('/packs/p')) {
            return http.Response(
              jsonEncode({
                'id': 'p',
                'name': 'Pack',
                'publisher': 'Artist',
                'canEdit': true,
                'stickers': rows,
              }),
              200,
            );
          }
          if (r.url.path.endsWith('/file')) return http.Response.bytes([], 404);
          return http.Response('[]', 200);
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: PackScreen(store: store, id: 'p'),
        ),
      );
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.keyJ);
      await tester.pumpAndSettle();
      expect(find.text('1 selected'), findsOneWidget);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      await tester.tap(find.bySemanticsLabel('Select sticker 3'));
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      await tester.pump();
      expect(find.text('3 selected'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.keyN);
      await tester.pumpAndSettle();
      expect(writes.where((w) => w['reviewStatus'] == 'NEEDS_WORK').length, 3);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pump();
      expect(find.text('3 selected'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('drag handle reorders without opening the image editor', (
    tester,
  ) async {
    String? moved;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StickerGrid(
            stickers: [
              for (final id in ['a', 'b', 'c']) {'id': id},
            ],
            selected: {},
            editable: true,
            public: false,
            image: (_) => const SizedBox.expand(),
            open: (_) => fail('Drag opened editor'),
            select: (_, _) {},
            action: (_, _) {},
            drop: (from, to) => moved = '$from/$to',
          ),
        ),
      ),
    );
    final source = tester.getCenter(
      find.byTooltip('Drag sticker 3 to reorder'),
    );
    final target = tester.getCenter(find.byKey(const ValueKey('sticker-a')));
    final gesture = await tester.startGesture(source);
    await gesture.moveBy(const Offset(-10, 0));
    await tester.pump();
    await gesture.moveTo(target);
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();
    expect(moved, 'c/a');
  });

  testWidgets('activity paginates complete history and changes page size', (
    tester,
  ) async {
    final store = TestStore()
      ..api = FoundryApi(
        'http://example.test/api/',
        client: MockClient(
          (_) async => http.Response(
            jsonEncode([
              for (var i = 0; i < 12; i++) {'id': '$i', 'action': 'event-$i'},
            ]),
            200,
          ),
        ),
      );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ActivityPanel(store: store, packId: 'p', manage: false),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Page 1 of 2'), findsOneWidget);
    await tester.tap(find.byTooltip('Next page'));
    await tester.pumpAndSettle();
    expect(find.text('event-10'), findsOneWidget);
    await tester.tap(find.text('10 per page'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('25 per page').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('Page 1 of 1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

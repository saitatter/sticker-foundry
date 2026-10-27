import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as img;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/cache.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/editor/image_editor.dart';
import 'package:sticker_foundry/ui/app.dart';

class MemoryCache implements AssetCache {
  final values = <String, Uint8List>{};
  @override
  Future<Uint8List?> read(String key) async => values[key];
  @override
  Future<void> write(String key, Uint8List bytes) async {
    values[key] = bytes;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }

  @override
  Future<void> clear() async {
    values.clear();
  }
}

class TestStore extends FoundryStore {
  TestStore() : super(cache: MemoryCache());
  @override
  Future<void> persist() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('com.stickerfoundry.app/native'),
          (_) async => null,
        );
  });
  test(
    'switching accounts erases private downloads and image memory',
    () async {
      SharedPreferences.setMockInitialValues({});
      final store = TestStore();
      store.prefs = await SharedPreferences.getInstance();
      store.user = {'id': 'previous-user'};
      store.cached['private'] = {'id': 'private'};
      store.images['private/sticker'] = Uint8List.fromList([1]);
      await store.cache.write('private/sticker.webp', Uint8List.fromList([1]));
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient(
          (request) async => request.url.path.endsWith('auth/login')
              ? http.Response(
                  '{"accessToken":"new","refreshToken":"refresh","user":{"id":"new-user"}}',
                  200,
                )
              : http.Response('[]', 200),
        ),
      );
      await store.authenticate('new@example.test', 'password');
      expect(store.cached, isEmpty);
      expect(store.images, isEmpty);
      expect(await store.cache.read('private/sticker.webp'), isNull);
      expect(store.user!['id'], 'new-user');
    },
  );
  test(
    'sync removes exports from both caches when pack access is lost',
    () async {
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            const MethodChannel('com.stickerfoundry.app/native'),
            (call) async {
              calls.add(call);
              return null;
            },
          );
      final store = TestStore();
      store.user = {'id': 'user'};
      store.cached['private'] = {
        'id': 'private',
        '_assets': ['sticker.webp'],
        '_assetRoot': 'private',
      };
      await store.cache.write('private/sticker.webp', Uint8List.fromList([1]));
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient(
          (request) async => http.Response(
            request.url.path.endsWith('sync/packs') ? '{"packs":[]}' : '[]',
            200,
          ),
        ),
      );
      await store.sync();
      expect(store.cached, isEmpty);
      expect(await store.cache.read('private/sticker.webp'), isNull);
      expect(
        calls.where((call) => call.method == 'removePack').single.arguments,
        {'id': 'private'},
      );
    },
  );
  testWidgets(
    'phone login retains both fields and rebuilds the library after authentication',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final store = TestStore();
      store.prefs = await SharedPreferences.getInstance();
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient((request) async {
          if (request.url.path.endsWith('auth/login')) {
            expect(jsonDecode(request.body), {
              'email': 'person@example.test',
              'password': 'password123',
            });
            return http.Response(
              '{"accessToken":"access","refreshToken":"refresh","user":{"id":"user","displayName":"Person"}}',
              200,
            );
          }
          if (request.url.path.endsWith('/packs')) {
            return http.Response(
              '[{"id":"p","name":"My stickers","publisher":"Person","stickerCount":3}]',
              200,
            );
          }
          return http.Response('[]', 200);
        }),
      );
      await tester.pumpWidget(MaterialApp(home: Home(store: store)));
      await tester.enterText(
        find.widgetWithText(TextField, 'Email'),
        'person@example.test',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Password'),
        'password123',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Your library'), findsOneWidget);
      expect(find.text('My stickers'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'editor adds movable text, supports undo and exports a square PNG on a phone',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final source = img.Image(width: 90, height: 60, numChannels: 4);
      img.fill(source, color: img.ColorRgba8(240, 80, 30, 255));
      final bytes = Uint8List.fromList(img.encodePng(source));
      EditedMedia? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  result = await editMedia(context, bytes, 'photo.png');
                },
                child: const Text('Open editor'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open editor'));
      await tester.pump();
      // Image codec work runs outside the fake clock.
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 200)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Text'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'HELLO');
      await tester.tap(find.text('Apply'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Undo'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.runAsync(() async {
        await tester.tap(find.byTooltip('Use image'));
        for (var i = 0; i < 50 && result == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
          await tester.pump();
        }
      });
      await tester.pumpAndSettle();
      expect(
        result,
        isNotNull,
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((t) => t.data)
            .join(' | '),
      );
      expect(result!.name, 'edited-sticker.png');
      final output = img.decodePng(result!.bytes)!;
      expect(output.width, 512);
      expect(output.height, 512);
      expect(result!.options['backgroundRemovalMode'], 'none');
      expect(tester.takeException(), isNull);
    },
  );
}

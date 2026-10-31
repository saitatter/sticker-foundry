import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/editor/image_editor.dart';
import 'package:sticker_foundry/media/photo_selection.dart';
import 'package:sticker_foundry/ui/sticker_source.dart';

import 'client_test.dart' show MemoryCache;

class PhotoPickerFake extends ImagePicker {
  CameraDevice? camera;
  bool? metadata;
  int? limit;
  XFile? result;
  LostDataResponse lost = LostDataResponse.empty();
  void Function()? onPick;
  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async {
    camera = preferredCameraDevice;
    metadata = requestFullMetadata;
    onPick?.call();
    return result;
  }

  @override
  Future<List<XFile>> pickMultiImage({
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    int? limit,
    bool requestFullMetadata = true,
  }) async {
    this.limit = limit;
    metadata = requestFullMetadata;
    return result == null ? [] : [result!];
  }

  @override
  Future<LostDataResponse> retrieveLostData() async {
    final response = lost;
    lost = LostDataResponse.empty();
    return response;
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('com.stickerfoundry.app/native'),
          (_) async => null,
        );
  });

  testWidgets(
    'source panel offers all six choices and disables static sources in animated packs',
    (tester) async {
      StickerSource? selected;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                selected = await showStickerSource(
                  context,
                  animated: true,
                  cameraSupported: true,
                );
              },
              child: const Text('Add'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      for (final name in [
        'Take photo',
        'Open gallery',
        'Select file',
        'Sticker library',
        'Text only',
        'Selfie camera',
      ]) {
        expect(find.text(name), findsOneWidget);
      }
      final camera = tester.widget<ListTile>(
        find.ancestor(
          of: find.text('Take photo'),
          matching: find.byType(ListTile),
        ),
      );
      final text = tester.widget<ListTile>(
        find.ancestor(
          of: find.text('Text only'),
          matching: find.byType(ListTile),
        ),
      );
      expect(camera.enabled, isFalse);
      expect(text.enabled, isFalse);
      await tester.tap(find.text('Select file'));
      await tester.pumpAndSettle();
      expect(selected, StickerSource.file);
    },
  );

  test('photo selection preserves front camera choice and bounds gallery selection without metadata access', () async {
    final prefs = await SharedPreferences.getInstance();
    final picker = PhotoPickerFake()
      ..result = XFile.fromData(Uint8List.fromList([1]), name: 'photo.png');
    picker.onPick = () {
      expect(
        jsonDecode(prefs.getString(PhotoSelection.pendingKey)!)['scope'],
        'server|owner',
      );
    };
    final files = await PhotoSelection.pick(
      prefs: prefs,
      scope: 'server|owner',
      packId: 'pack',
      source: ImageSource.camera,
      camera: CameraDevice.front,
      picker: picker,
    );
    expect(files.length, 1);
    expect(picker.camera, CameraDevice.front);
    expect(picker.metadata, isFalse);
    expect(prefs.containsKey(PhotoSelection.pendingKey), isFalse);
    await PhotoSelection.pick(
      prefs: prefs,
      scope: 'server|owner',
      packId: 'pack',
      source: ImageSource.gallery,
      picker: picker,
      limit: 4,
    );
    expect(picker.limit, 4);
    expect(picker.metadata, isFalse);
    picker.result = null;
    expect(
      await PhotoSelection.pick(
        prefs: prefs,
        scope: 'server|owner',
        packId: 'pack',
        source: ImageSource.camera,
        picker: picker,
      ),
      isEmpty,
    );
    expect(prefs.containsKey(PhotoSelection.pendingKey), isFalse);
  });

  test(
    'interrupted photos recover only for their original server and account',
    () async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        PhotoSelection.pendingKey,
        jsonEncode({'scope': 'server|owner', 'packId': 'pack'}),
      );
      final picker = PhotoPickerFake()
        ..lost = LostDataResponse(files: [XFile('/qa-cache/photo.png')]);
      final recovered = await PhotoSelection.recover(
        prefs,
        'server|owner',
        picker: picker,
      );
      expect(recovered!.packId, 'pack');
      expect(recovered.files.single.path, '/qa-cache/photo.png');
      expect(
        (await PhotoSelection.recover(
          prefs,
          'server|owner',
          picker: picker,
        ))!.files.single.path,
        '/qa-cache/photo.png',
      );
      expect(
        await PhotoSelection.recover(
          prefs,
          'another-server|owner',
          picker: picker,
        ),
        isNull,
      );
      expect(prefs.containsKey(PhotoSelection.pendingKey), isFalse);
    },
  );

  test(
    'source size limits reject a large image before loading its bytes',
    () async {
      var read = false;
      final input = StickerInput('large.png', () async {
        read = true;
        return Uint8List(1);
      }, () async => 11 * 1024 * 1024);
      await expectLater(input.bytes(), throwsStateError);
      expect(read, isFalse);
    },
  );

  for (final status in [200, 403, 401]) {
    final denied = status != 200;
    testWidgets(
      'library selection respects status $status and preserves permitted metadata',
      (tester) async {
        final bytes = Uint8List.fromList(
          img.encodePng(img.Image(width: 8, height: 8, numChannels: 4)),
        );
        var denyFile = false;
        final store = FoundryStore(cache: MemoryCache())..user = {'id': 'qa'};
        store.prefs = await SharedPreferences.getInstance();
        store.api = FoundryApi(
          'http://example.test/api/',
          client: MockClient((request) async {
            if (request.url.path.endsWith('/auth/refresh')) {
              return http.Response('{"message":"Expired"}', 401);
            }
            if (request.url.path.endsWith('/file')) {
              return denyFile
                  ? http.Response(
                      '{"message":"Pack access was revoked"}',
                      status,
                    )
                  : http.Response.bytes(bytes, 200);
            }
            if (request.url.path.endsWith('/packs/source')) {
              return http.Response(
                jsonEncode({
                  'id': 'source',
                  'imageDataVersion': 1,
                  'isAnimated': false,
                  'stickers': [
                    {
                      'id': 's',
                      'fileName': 'source.webp',
                      'emojis': ['hi'],
                      'accessibilityText': 'Sample',
                    },
                  ],
                }),
                200,
              );
            }
            return http.Response(
              jsonEncode([
                {
                  'id': 'source',
                  'name': 'Source pack',
                  'isAnimated': false,
                  'stickerCount': 1,
                },
                {
                  'id': 'wrong',
                  'name': 'Animated pack',
                  'isAnimated': true,
                  'stickerCount': 1,
                },
              ]),
              200,
            );
          }),
        );
        List<StickerInput>? selection;
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => TextButton(
                onPressed: () async {
                  selection = await pickStickerInputs(context, store, {
                    'id': 'target',
                    'isAnimated': false,
                  });
                },
                child: const Text('Add'),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Sticker library'));
        await tester.pumpAndSettle();
        expect(find.text('Animated pack'), findsNothing);
        await tester.tap(find.text('Source pack'));
        await tester.pumpAndSettle();
        denyFile = denied;
        await tester.tap(find.bySemanticsLabel(RegExp('Use sticker 1')));
        await tester.pumpAndSettle();
        if (denied) {
          expect(selection, isNull);
          expect(
            find.text(status == 401 ? 'Expired' : 'Pack access was revoked'),
            findsOneWidget,
          );
          expect(store.images, isEmpty);
          if (status == 401) expect(store.user, isNull);
        } else {
          expect(selection!.single.recipe!.accessibilityText, 'Sample');
          expect(selection!.single.recipe!.emojis, 'hi');
          expect(await selection!.single.bytes(), bytes);
        }
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'text-only editor requires text and exports visible glyphs on a transparent canvas',
    (tester) async {
      late Uint8List bytes;
      await tester.runAsync(() async {
        bytes = await blankStickerCanvas();
      });
      EditedMedia? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await editMedia(
                  context,
                  bytes,
                  'text-sticker.png',
                  textOnly: true,
                );
              },
              child: const Text('Add'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Add'));
      await tester.pump();
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 200)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Sticker text'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Apply'))
            .onPressed,
        isNull,
      );
      await tester.enterText(find.byType(TextFormField), 'HELLO');
      await tester.pump();
      await tester.tap(find.text('Apply'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Undo'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use image'));
      await tester.pumpAndSettle();
      expect(find.text('Add text before saving this sticker.'), findsOneWidget);
      expect(result, isNull);
      await tester.tap(find.byTooltip('Redo'));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await tester.tap(find.text('Use image'));
        for (var i = 0; i < 50 && result == null; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
          await tester.pump();
        }
      });
      expect(result, isNotNull);
      final image = img.decodePng(result!.bytes)!;
      expect(image.width, 512);
      expect(image.height, 512);
      expect(image.getPixel(0, 0).a, 0);
      expect(image.any((pixel) => pixel.a > 0), isTrue);
      expect(
        result!.recipe!.document.texts.single.position,
        const Offset(.5, .5),
      );
      expect(tester.takeException(), isNull);
    },
  );
}

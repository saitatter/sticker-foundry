import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../editor/editor_document.dart';
import '../media/photo_selection.dart';
import 'common.dart';
import 'sticker_image.dart';

enum StickerSource { camera, gallery, file, library, text, selfie }

class StickerInput {
  final String name;
  final Future<Uint8List> Function() read;
  final Future<int?> Function() length;
  final EditorRecipe? recipe;
  final bool textOnly;
  StickerInput(
    this.name,
    this.read,
    this.length, {
    this.recipe,
    this.textOnly = false,
  });
  Future<Uint8List> bytes() async {
    try {
      if ((await length() ?? 0) > 10 * 1024 * 1024) {
        throw StateError('Choose an image smaller than 10 MB.');
      }
      final bytes = await read();
      if (bytes.length > 10 * 1024 * 1024) {
        throw StateError('Choose an image smaller than 10 MB.');
      }
      return bytes;
    } on StateError {
      rethrow;
    } catch (_) {
      throw StateError('This image is no longer available. Choose it again.');
    }
  }

  static StickerInput photo(XFile file) =>
      StickerInput(file.name, file.readAsBytes, file.length);
}

Future<Uint8List> blankStickerCanvas() async {
  final recorder = ui.PictureRecorder();
  ui.Canvas(recorder).drawColor(const Color(0x00000000), ui.BlendMode.src);
  final picture = recorder.endRecording();
  final image = await picture.toImage(512, 512);
  try {
    final data = (await image.toByteData(format: ui.ImageByteFormat.png))!;
    return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  } finally {
    image.dispose();
    picture.dispose();
  }
}

Future<StickerSource?> showStickerSource(
  BuildContext context, {
  required bool animated,
  bool? cameraSupported,
}) {
  final camera =
      cameraSupported ?? ImagePicker().supportsImageSource(ImageSource.camera);
  return showModalBottomSheet<StickerSource>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    constraints: const BoxConstraints(maxWidth: 600),
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
                child: Text(
                  'Pick image from',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              for (final option in [
                (
                  StickerSource.camera,
                  Icons.photo_camera_outlined,
                  'Take photo',
                ),
                (
                  StickerSource.gallery,
                  Icons.photo_library_outlined,
                  'Open gallery',
                ),
                (
                  StickerSource.file,
                  Icons.insert_drive_file_outlined,
                  'Select file',
                ),
                (
                  StickerSource.library,
                  Icons.collections_outlined,
                  'Sticker library',
                ),
                (StickerSource.text, Icons.text_fields, 'Text only'),
                (
                  StickerSource.selfie,
                  Icons.camera_front_outlined,
                  'Selfie camera',
                ),
              ])
                Builder(
                  builder: (context) {
                    final photo =
                        option.$1 == StickerSource.camera ||
                        option.$1 == StickerSource.selfie;
                    final staticOnly = photo || option.$1 == StickerSource.text;
                    final enabled =
                        !(animated && staticOnly) && (!photo || camera);
                    return ListTile(
                      leading: Icon(option.$2),
                      title: Text(option.$3),
                      enabled: enabled,
                      subtitle: !enabled
                          ? Text(
                              animated && staticOnly
                                  ? 'Use a static pack for this source'
                                  : 'Not available on this device',
                            )
                          : null,
                      onTap: enabled
                          ? () => Navigator.pop(context, option.$1)
                          : null,
                    );
                  },
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

Future<List<StickerInput>> pickStickerInputs(
  BuildContext context,
  FoundryStore store,
  Json target,
) async {
  final source = await showStickerSource(
    context,
    animated: target['isAnimated'] == true,
  );
  if (source == null || !context.mounted) return [];
  switch (source) {
    case StickerSource.file:
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'],
      );
      return [
        for (final file in files)
          StickerInput(file.name, file.readAsBytes, file.length),
      ];
    case StickerSource.text:
      final bytes = await blankStickerCanvas();
      return [
        StickerInput(
          'text-sticker.png',
          () async => bytes,
          () async => bytes.length,
          textOnly: true,
        ),
      ];
    case StickerSource.library:
      final file = await showDialog<StickerInput>(
        context: context,
        builder: (_) => _LibraryPicker(store: store, target: target),
      );
      return file == null ? [] : [file];
    case StickerSource.camera:
    case StickerSource.selfie:
    case StickerSource.gallery:
      await store.clearPhotoRecovery();
      final photos = await PhotoSelection.pick(
        prefs: store.prefs,
        scope: store.scope,
        packId: target['id'],
        source: source == StickerSource.gallery
            ? ImageSource.gallery
            : ImageSource.camera,
        camera: source == StickerSource.selfie
            ? CameraDevice.front
            : CameraDevice.rear,
        limit: 30 - objects(target['stickers']).length,
      );
      return photos.map(StickerInput.photo).toList();
  }
}

class _LibraryPicker extends StatefulWidget {
  final FoundryStore store;
  final Json target;
  const _LibraryPicker({required this.store, required this.target});
  @override
  State<_LibraryPicker> createState() => _LibraryPickerState();
}

class _LibraryPickerState extends State<_LibraryPicker> {
  late Future<dynamic> packs;
  Future<Json>? detail;
  Json? pack;
  bool reading = false;
  String? error;
  @override
  void initState() {
    super.initState();
    packs = request('packs');
  }

  Future<dynamic> request(
    String path, {
    bool raw = false,
    String? packId,
  }) async {
    try {
      return await widget.store.api.request(path, raw: raw);
    } on ApiError catch (e) {
      if (e.status == 401) {
        await widget.store.signOut();
      } else if (e.status == 403 && packId != null) {
        await widget.store.removeCachedPack(packId);
      }
      rethrow;
    }
  }

  Future<void> choose(Json sticker, Json parent) async {
    if (reading) return;
    setState(() {
      reading = true;
      error = null;
    });
    final scope = widget.store.scope;
    try {
      final bytes = await request(
        'packs/${parent['id']}/stickers/${sticker['id']}/file',
        raw: true,
        packId: parent['id'],
      ) as Uint8List;
      if (widget.store.scope != scope || widget.store.user == null) {
        throw StateError('Your session changed. Select the image again.');
      }
      if (!mounted) return;
      Navigator.pop(
        context,
        StickerInput(
          sticker['fileName'],
          () async => bytes,
          () async => bytes.length,
          recipe: EditorRecipe(
            document: EditDocument(),
            emojis: (sticker['emojis'] as List? ?? []).join(','),
            accessibilityText: sticker['accessibilityText'] ?? '',
          ),
        ),
      );
    } catch (e) {
      if (mounted) setState(() => error = userMessage(e));
    } finally {
      if (mounted) setState(() => reading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Dialog.fullscreen(
    child: Scaffold(
      appBar: AppBar(
        title: Text(pack == null ? 'Sticker library' : pack!['name']),
        leading: IconButton(
          tooltip: pack == null ? 'Close library' : 'Back to packs',
          icon: Icon(pack == null ? Icons.close : Icons.arrow_back),
          onPressed: reading
              ? null
              : () {
                  if (pack == null) {
                    Navigator.pop(context);
                  } else {
                    setState(() {
                      pack = null;
                      detail = null;
                      error = null;
                    });
                  }
                },
        ),
      ),
      body: Column(
        children: [
          if (reading) const LinearProgressIndicator(),
          if (error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Expanded(
            child: FutureBuilder<dynamic>(
              future: detail ?? packs,
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return requestFailure(
                    snapshot.error,
                    () => setState(() {
                      if (pack == null) {
                        packs = request('packs');
                      } else {
                        detail = request(
                          'packs/${pack!['id']}',
                          packId: pack!['id'],
                        ).then(object);
                      }
                    }),
                  );
                }
                if (!snapshot.hasData ||
                    snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (pack == null) {
                  final rows = objects(snapshot.data)
                      .where(
                        (p) =>
                            p['id'] != widget.target['id'] &&
                            p['isAnimated'] == widget.target['isAnimated'] &&
                            (p['stickerCount'] as int? ?? 0) > 0,
                      )
                      .toList();
                  if (rows.isEmpty) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'No other compatible packs yet. Create another pack with the same sticker type, or choose a different source.',
                        ),
                      ),
                    );
                  }
                  return ListView(
                    children: [
                      for (final p in rows)
                        ListTile(
                          leading: const Icon(Icons.collections_outlined),
                          title: Text(p['name']),
                          subtitle: Text('${p['stickerCount']} stickers'),
                          onTap: reading
                              ? null
                              : () => setState(() {
                                  pack = p;
                                  detail = request(
                                    'packs/${p['id']}',
                                    packId: p['id'],
                                  ).then(object);
                                }),
                        ),
                    ],
                  );
                }
                final parent = object(snapshot.data);
                final stickers = objects(parent['stickers']);
                if (stickers.isEmpty) {
                  return const Center(
                    child: Text('This pack has no stickers.'),
                  );
                }
                return GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 160,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  itemCount: stickers.length,
                  itemBuilder: (context, index) => Card(
                    child: InkWell(
                      onTap: reading
                          ? null
                          : () => choose(stickers[index], parent),
                      child: Semantics(
                        label: 'Use sticker ${index + 1}',
                        button: true,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: StickerImage(
                            store: widget.store,
                            pack: parent,
                            sticker: stickers[index],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}

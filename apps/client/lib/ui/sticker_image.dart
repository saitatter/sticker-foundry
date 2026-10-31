import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/store.dart';

class StickerImage extends StatelessWidget {
  final FoundryStore store;
  final Map<String, dynamic> pack, sticker;
  final bool public;
  const StickerImage({
    super.key,
    required this.store,
    required this.pack,
    required this.sticker,
    this.public = false,
  });
  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List?>(
    future: public
        ? store.api
              .request(
                'public/packs/${pack['id']}/stickers/${sticker['id']}/file',
                auth: false,
                raw: true,
              )
              .then((v) => v as Uint8List)
        : store.sticker(pack, sticker),
    builder: (_, snap) => snap.hasData
        ? Image.memory(
            snap.data!,
            fit: BoxFit.contain,
            gaplessPlayback: true,
            semanticLabel: '${sticker['accessibilityText'] ?? 'Sticker'}',
            errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined),
          )
        : Center(
            child: snap.hasError
                ? const Icon(Icons.cloud_off)
                : const CircularProgressIndicator(strokeWidth: 2),
          ),
  );
}

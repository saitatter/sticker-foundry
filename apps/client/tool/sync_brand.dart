import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:image/image.dart' as image;

/// Builds platform containers/sizes from the existing artwork, without redesigning it.
/// Android's previous launcher/adaptive icons are deliberately preserved unchanged.
Future<void> main(List<String> args) async {
  final client = File.fromUri(Platform.script).parent.parent;
  final repo = client.parent.parent;
  final original = await File(
    '${repo.path}/assets/brand/sticker-foundry-icon.png',
  ).readAsBytes();
  final source = image.decodePng(original)!;
  if (source.width != source.height) {
    throw StateError('The canonical logo must be square');
  }
  final outputs = <String, Uint8List>{
    'assets/brand/sticker-foundry-icon.png': original,
  };

  image.Image icon(int size, {bool opaque = false, bool maskable = false}) {
    final resized = image.copyResize(
      source,
      width: maskable ? (size * .8).round() : size,
      interpolation: image.Interpolation.average,
    );
    if (!opaque && !maskable) return resized;
    final canvas = image.Image(width: size, height: size, numChannels: 3);
    image.fill(canvas, color: image.ColorRgb8(11, 127, 117));
    image.compositeImage(
      canvas,
      resized,
      dstX: (size - resized.width) ~/ 2,
      dstY: (size - resized.height) ~/ 2,
    );
    return canvas;
  }

  void png(
    String path,
    int size, {
    bool opaque = false,
    bool maskable = false,
  }) {
    outputs[path] = image.encodePng(
      icon(size, opaque: opaque, maskable: maskable),
    );
  }

  png('web/favicon.png', 64);
  png('web/apple-touch-icon.png', 180, opaque: true);
  for (final size in [192, 512]) {
    png('web/icons/Icon-$size.png', size);
    png('web/icons/Icon-maskable-$size.png', size, maskable: true);
  }
  for (final platform in ['ios', 'macos']) {
    final folder = '$platform/Runner/Assets.xcassets/AppIcon.appiconset';
    final contents = jsonDecode(
      await File('${client.path}/$folder/Contents.json').readAsString(),
    ) as Map;
    for (final entry in contents['images'] as List) {
      final size = double.parse((entry['size'] as String).split('x').first);
      final scale = double.parse(
        (entry['scale'] as String).replaceAll('x', ''),
      );
      png(
        '$folder/${entry['filename']}',
        (size * scale).round(),
        opaque: platform == 'ios',
      );
    }
  }
  for (var scale = 1; scale <= 3; scale++) {
    png(
      'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage${scale == 1 ? '' : '@${scale}x'}.png',
      128 * scale,
    );
  }
  outputs['windows/runner/resources/app_icon.ico'] = image.IcoEncoder()
      .encodeImages([
        for (final size in [16, 32, 48, 64, 128, 256]) icon(size),
      ]);
  png('linux/runner/resources/com.stickerfoundry.app.png', 256);

  final check = args.contains('--check');
  final stale = <String>[];
  for (final entry in outputs.entries) {
    final file = File('${client.path}/${entry.key}');
    if (check) {
      final actual = await file.exists()
          ? await file.readAsBytes()
          : Uint8List(0);
      if (actual.length != entry.value.length ||
          actual.indexed.any((byte) => byte.$2 != entry.value[byte.$1])) {
        stale.add(entry.key);
      }
    } else {
      await file.parent.create(recursive: true);
      await file.writeAsBytes(entry.value);
    }
  }
  if (stale.isNotEmpty) {
    throw StateError(
      'Brand assets are stale: ${stale.join(', ')}. Run dart run tool/sync_brand.dart.',
    );
  }
  stdout.writeln(
    '${outputs.length} brand assets ${check ? 'verified' : 'synchronized'} from assets/brand/sticker-foundry-icon.png.',
  );
}

import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:sticker_foundry/editor/editor_document.dart';
import 'package:sticker_foundry/editor/editor_renderer.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'animation sampling preserves variable timing and exact trimmed duration',
    () {
      final timing = AnimationTiming([100, 300, 200]);
      expect(timing.seconds, .6);
      expect([0.0, .099, .1, .399, .4, .6].map(timing.frameAt), [
        0,
        0,
        1,
        1,
        2,
        2,
      ]);
      final samples = timing.sample(.1, .6, 20);
      expect(samples.map((f) => f.index), [1, 2]);
      expect(samples.map((f) => f.centiseconds), [30, 20]);
      expect(() => timing.sample(.5, .1, 15), throwsFormatException);
      expect(() => timing.sample(0, .6, 0), throwsFormatException);
      expect(AnimationTiming([0, 100]).seconds, .2);
      final repeated = timing.sample(.1, .2, 15);
      expect(repeated.length, 2); // Preserve the animated upload contract.
      expect(repeated.fold<int>(0, (sum, f) => sum + f.centiseconds), 10);
    },
  );

  test(
    'batch recipes are independent snapshots and avoid applying trim twice',
    () {
      final doc = EditDocument()..preset('Meme cutout');
      final recipe = EditorRecipe(
        document: doc,
        trimStart: 2,
        trimEnd: 5,
        emojis: 'a,b,c,d',
        optimize: true,
        quality: 65,
      );
      final copy = recipe.copy();
      doc.texts.first.text = 'CHANGED';
      doc.strokes.add(InkStroke([Offset.zero], .1, false));
      expect(copy.document.texts.first.text, 'TEXT');
      expect(copy.document.strokes, isEmpty);
      expect(copy.document.autoFit && copy.document.outline, isTrue);
      expect(copy.options(animated: false)['staticQuality'], 65);
      final options = copy.options(animated: true, bakedDuration: 3);
      expect(options['animatedTrimStart'], 0);
      expect(options['animatedTrimEnd'], 3);
      expect(options['emojis'], ['a', 'b', 'c']);
      expect(
        copy.options(animated: false, tray: true).containsKey('staticQuality'),
        isFalse,
      );
    },
  );

  test('speckle cleanup removes isolated noise but keeps the main subject', () {
    final pixels = img.Image(width: 8, height: 8, numChannels: 4);
    img.fillRect(
      pixels,
      x1: 2,
      y1: 2,
      x2: 5,
      y2: 5,
      color: img.ColorRgba8(255, 0, 0, 255),
    );
    pixels.setPixelRgba(0, 0, 255, 0, 0, 255);
    cleanSpeckles(pixels, 24);
    expect(pixels.getPixel(0, 0).a, 0);
    expect(pixels.getPixel(3, 3).a, 255);
  });

  test(
    'cutout and auto-fit retain transparency while framing the subject',
    () async {
      final source = img.Image(width: 40, height: 20, numChannels: 4);
      img.fill(source, color: img.ColorRgba8(255, 255, 255, 255));
      img.fillRect(
        source,
        x1: 15,
        y1: 5,
        x2: 24,
        y2: 14,
        color: img.ColorRgba8(255, 0, 0, 255),
      );
      final codec = await editorCodec(
        Uint8List.fromList(img.encodePng(source)),
      );
      final frame = (await codec.getNextFrame()).image;
      final doc = EditDocument()
        ..removeLightBackground = true
        ..autoFit = true;
      final output = await renderEditorFrame(frame, doc, pixels: 64);
      final bytes = await output.toByteData(format: ui.ImageByteFormat.png);
      final pixels = img.decodePng(bytes!.buffer.asUint8List())!;
      expect(pixels.getPixel(0, 0).a, 0);
      expect(pixels.getPixel(32, 32).r, greaterThan(240));
      expect(pixels.getPixel(32, 32).a, 255);
      expect(pixels.getPixel(10, 32).a, greaterThan(240));
      output.dispose();
      frame.dispose();
      codec.dispose();
    },
  );

  test(
    'animated effects export all selected frames with preserved timing',
    () async {
      final animation = img.Image(width: 12, height: 12, numChannels: 4);
      img.fill(animation, color: img.ColorRgba8(255, 0, 0, 255));
      animation.frameDuration = 100;
      final second = animation.addFrame();
      img.fill(second, color: img.ColorRgba8(0, 255, 0, 255));
      second.frameDuration = 300;
      final third = animation.addFrame();
      img.fill(third, color: img.ColorRgba8(0, 0, 255, 255));
      third.frameDuration = 200;
      final output = await renderEditedMedia(
        Uint8List.fromList(img.encodeGif(animation)),
        'source.gif',
        EditorRecipe(
          document: EditDocument()..rotation = 1,
          trimStart: .1,
          trimEnd: .6,
          fps: 20,
        ),
        animated: true,
      );
      final result = img.decodeGif(output.bytes)!;
      expect(result.width, 512);
      expect(result.numFrames, 2);
      expect(result.frames.map((f) => f.frameDuration), [300, 200]);
      expect(result.frames.first.getPixel(256, 256).g, greaterThan(200));
      expect(result.frames.last.getPixel(256, 256).b, greaterThan(200));
      expect(output.options['animatedTrimStart'], 0);
      expect(output.options['animatedTrimEnd'], .5);
    },
  );
}

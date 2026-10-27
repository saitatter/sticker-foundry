import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image/image.dart' as image;

import 'editor_document.dart';
import 'editor_painter.dart';

Future<ui.Codec> editorCodec(Uint8List bytes, {int maxSide = 1024}) async {
  final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
  return ui.instantiateImageCodecWithSize(
    buffer,
    getTargetSize: (width, height) {
      final ratio = math.min(1, maxSide / math.max(width, height));
      return ui.TargetImageSize(
        width: math.max(1, (width * ratio).round()),
        height: math.max(1, (height * ratio).round()),
      );
    },
  );
}

Future<ui.Image> prepareEditorFrame(ui.Image source, EditDocument doc) async {
  if (!doc.removeLightBackground && !doc.autoFit && doc.sharpen == 0) {
    return source.clone();
  }
  final data = await source.toByteData(
    format: ui.ImageByteFormat.rawStraightRgba,
  );
  var pixels = image.Image.fromBytes(
    width: source.width,
    height: source.height,
    bytes: data!.buffer,
    bytesOffset: data.offsetInBytes,
    numChannels: 4,
  );
  if (doc.removeLightBackground) {
    for (final pixel in pixels) {
      final light = math.min(pixel.r, math.min(pixel.g, pixel.b));
      final alpha = doc.feather <= 0
          ? (light >= doc.threshold ? 0.0 : 1.0)
          : ((doc.threshold - light) / doc.feather).clamp(0.0, 1.0);
      pixel.a = (pixel.a * alpha).round();
    }
    if (doc.cleanup) cleanSpeckles(pixels, doc.speckle.round());
  }
  if (doc.autoFit) {
    var left = pixels.width, top = pixels.height, right = -1, bottom = -1;
    for (final p in pixels) {
      if (p.a > 8) {
        left = math.min(left, p.x);
        right = math.max(right, p.x);
        top = math.min(top, p.y);
        bottom = math.max(bottom, p.y);
      }
    }
    if (right >= left && bottom >= top) {
      pixels = image.copyCrop(
        pixels,
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
      );
    }
  }
  if (doc.sharpen > 0) {
    final a = doc.sharpen;
    pixels = image.convolution(
      pixels,
      filter: [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0],
    );
  }
  final codec = await ui.instantiateImageCodec(image.encodePng(pixels));
  try {
    return (await codec.getNextFrame()).image;
  } finally {
    codec.dispose();
  }
}

void cleanSpeckles(image.Image pixels, int limit) {
  final visited = Uint8List(pixels.width * pixels.height),
      small = <List<int>>[];
  var largest = <int>[], largestSize = 0;
  for (var index = 0; index < visited.length; index++) {
    if (visited[index] != 0 ||
        pixels.getPixel(index % pixels.width, index ~/ pixels.width).a <= 8) {
      continue;
    }
    final queue = <int>[index];
    visited[index] = 1;
    var cursor = 0;
    while (cursor < queue.length) {
      final p = queue[cursor++], x = p % pixels.width, y = p ~/ pixels.width;
      for (final next in [
        if (x > 0) p - 1,
        if (x + 1 < pixels.width) p + 1,
        if (y > 0) p - pixels.width,
        if (y + 1 < pixels.height) p + pixels.width,
      ]) {
        if (visited[next] == 0 &&
            pixels.getPixel(next % pixels.width, next ~/ pixels.width).a > 8) {
          visited[next] = 1;
          queue.add(next);
        }
      }
    }
    if (queue.length > largestSize) {
      largestSize = queue.length;
      largest = queue;
    }
    if (queue.length <= limit) small.add(queue);
  }
  for (final component in small) {
    if (identical(component, largest)) continue;
    for (final p in component) {
      pixels.getPixel(p % pixels.width, p ~/ pixels.width).a = 0;
    }
  }
}

Future<ui.Image> renderEditorFrame(
  ui.Image source,
  EditDocument doc, {
  int pixels = 512,
}) async {
  final prepared = await prepareEditorFrame(source, doc);
  try {
    final recorder = ui.PictureRecorder(), canvas = Canvas(recorder);
    final size = pixels.toDouble();
    final scale = 1 / math.max(doc.crop.width, doc.crop.height);
    canvas.translate(size / 2, size / 2);
    canvas.scale(scale);
    canvas.translate(-doc.crop.center.dx * size, -doc.crop.center.dy * size);
    MediaPainter(prepared, doc, false, null).paint(canvas, Size.square(size));
    final picture = recorder.endRecording();
    try {
      return await picture.toImage(pixels, pixels);
    } finally {
      picture.dispose();
    }
  } finally {
    prepared.dispose();
  }
}

Future<EditedMedia> renderEditedMedia(
  Uint8List bytes,
  String name,
  EditorRecipe recipe, {
  bool animated = false,
  bool tray = false,
  void Function(double)? progress,
  bool Function()? cancelled,
}) async {
  final doc = recipe.document;
  if (!doc.transformed && !tray) {
    return EditedMedia(
      bytes,
      name,
      recipe.options(animated: animated),
      recipe: recipe.copy(),
    );
  }
  final codec = await editorCodec(bytes);
  double? bakedDuration;
  try {
    if (!animated || tray) {
      final frame = await codec.getNextFrame();
      ui.Image? rendered;
      try {
        rendered = await renderEditorFrame(frame.image, doc);
        final png = await rendered.toByteData(format: ui.ImageByteFormat.png);
        progress?.call(1);
        return EditedMedia(
          png!.buffer.asUint8List(png.offsetInBytes, png.lengthInBytes),
          'edited-sticker.png',
          recipe.options(animated: false, tray: tray),
          recipe: recipe.copy(),
        );
      } finally {
        frame.image.dispose();
        rendered?.dispose();
      }
    }
    if (codec.frameCount < 2) {
      throw const FormatException(
        'An animated pack requires an animated GIF or WebP',
      );
    }
    // Read exact source timing without retaining raw full-size animation frames.
    final durations = <int>[];
    for (var i = 0; i < codec.frameCount; i++) {
      if (cancelled?.call() == true) throw StateError('Edit cancelled');
      final frame = await codec.getNextFrame();
      durations.add(frame.duration.inMilliseconds);
      frame.image.dispose();
    }
    // getNextFrame loops to the beginning after the timing pass.
    final timing = AnimationTiming(durations),
        start = recipe.trimStart
            .clamp(0.0, math.max(0.0, timing.seconds - .1))
            .toDouble();
    final end = recipe.trimEnd.clamp(start + .01, timing.seconds);
    final samples = timing.sample(start, end, recipe.fps.round());
    final encoder = image.GifEncoder();
    ui.Image? current;
    var currentIndex = -1;
    try {
      for (var i = 0; i < samples.length; i++) {
        if (cancelled?.call() == true) throw StateError('Edit cancelled');
        final sample = samples[i];
        while (currentIndex < sample.index) {
          current?.dispose();
          current = (await codec.getNextFrame()).image;
          currentIndex++;
        }
        final rendered = await renderEditorFrame(current!, doc);
        try {
          final raw = await rendered.toByteData(
            format: ui.ImageByteFormat.rawStraightRgba,
          );
          final frame = image.Image.fromBytes(
            width: 512,
            height: 512,
            bytes: raw!.buffer,
            bytesOffset: raw.offsetInBytes,
            numChannels: 4,
          );
          encoder.addFrame(frame, duration: sample.centiseconds);
        } finally {
          rendered.dispose();
        }
        progress?.call((i + 1) / samples.length);
        await Future<void>.delayed(Duration.zero);
      }
    } finally {
      current?.dispose();
    }
    bakedDuration =
        samples.fold<int>(0, (sum, frame) => sum + frame.centiseconds) / 100;
    return EditedMedia(
      encoder.finish()!,
      'edited-animation.gif',
      recipe.options(animated: true, bakedDuration: bakedDuration),
      recipe: recipe.copy(),
    );
  } finally {
    codec.dispose();
  }
}

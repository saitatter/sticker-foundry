import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api.dart';

class InkStroke {
  final List<Offset> points;
  final double width;
  final bool restore;
  InkStroke(this.points, this.width, this.restore);
}

class TextLayer {
  String text;
  Offset position;
  double size, rotation, strokeWidth;
  Color color, strokeColor;
  TextLayer(
    this.text,
    this.position,
    this.size, {
    this.rotation = 0,
    this.strokeWidth = 5,
    this.color = Colors.white,
    this.strokeColor = const Color(0xff111827),
  });
  TextLayer copy() => TextLayer(
    text,
    position,
    size,
    rotation: rotation,
    strokeWidth: strokeWidth,
    color: color,
    strokeColor: strokeColor,
  );
}

class EditDocument {
  int rotation = 0;
  Rect crop = const Rect.fromLTWH(0, 0, 1, 1);
  double brightness = 0,
      contrast = 1,
      saturation = 1,
      warmth = 0,
      tint = 0,
      sharpen = 0,
      imageScale = 1,
      padding = .12,
      outlineWidth = 6;
  Offset imageOffset = Offset.zero;
  bool grayscale = false,
      removeLightBackground = false,
      autoFit = false,
      outline = false,
      shadow = false,
      cleanup = true;
  double threshold = 238, feather = 14, speckle = 24;
  List<InkStroke> strokes = [];
  List<TextLayer> texts = [];
  EditDocument copy() => EditDocument()
    ..rotation = rotation
    ..crop = crop
    ..brightness = brightness
    ..contrast = contrast
    ..saturation = saturation
    ..warmth = warmth
    ..tint = tint
    ..sharpen = sharpen
    ..imageScale = imageScale
    ..imageOffset = imageOffset
    ..padding = padding
    ..outlineWidth = outlineWidth
    ..grayscale = grayscale
    ..removeLightBackground = removeLightBackground
    ..autoFit = autoFit
    ..outline = outline
    ..shadow = shadow
    ..cleanup = cleanup
    ..threshold = threshold
    ..feather = feather
    ..speckle = speckle
    ..strokes = strokes
        .map((s) => InkStroke([...s.points], s.width, s.restore))
        .toList()
    ..texts = texts.map((t) => t.copy()).toList();
  bool get transformed =>
      rotation != 0 ||
      crop != const Rect.fromLTWH(0, 0, 1, 1) ||
      brightness != 0 ||
      contrast != 1 ||
      saturation != 1 ||
      warmth != 0 ||
      tint != 0 ||
      sharpen != 0 ||
      imageScale != 1 ||
      imageOffset != Offset.zero ||
      grayscale ||
      removeLightBackground ||
      autoFit ||
      outline ||
      shadow ||
      strokes.isNotEmpty ||
      texts.isNotEmpty;
  String get pixelSignature =>
      '$removeLightBackground/$threshold/$feather/$cleanup/$speckle/$autoFit/$sharpen';
  void preset(String name) {
    if (name == 'Meme cutout') {
      removeLightBackground = true;
      threshold = 232;
      feather = 18;
      speckle = 36;
      cleanup = true;
      autoFit = true;
      outline = true;
      if (texts.isEmpty) {
        texts.add(TextLayer('TEXT', const Offset(.5, .84), .125));
      }
    }
    if (name == 'Soft shadow') {
      autoFit = true;
      padding = .14;
      shadow = true;
    }
    if (name == 'Bold outline') {
      removeLightBackground = true;
      threshold = 236;
      feather = 10;
      cleanup = true;
      autoFit = true;
      outline = true;
    }
  }
}

class EditorRecipe {
  final EditDocument document;
  final String background, emojis, accessibilityText;
  final double trimStart, trimEnd, fps, quality;
  final bool optimize, animatedCompress, includeEmptyMetadata;
  EditorRecipe({
    required this.document,
    this.background = 'none',
    this.emojis = '',
    this.accessibilityText = '',
    this.trimStart = 0,
    this.trimEnd = 10,
    this.fps = 15,
    this.quality = 82,
    this.optimize = false,
    this.animatedCompress = true,
    this.includeEmptyMetadata = false,
  });
  EditorRecipe copy() => EditorRecipe(
    document: document.copy(),
    background: background,
    emojis: emojis,
    accessibilityText: accessibilityText,
    trimStart: trimStart,
    trimEnd: trimEnd,
    fps: fps,
    quality: quality,
    optimize: optimize,
    animatedCompress: animatedCompress,
    includeEmptyMetadata: includeEmptyMetadata,
  );
  Json options({
    required bool animated,
    bool tray = false,
    double? bakedDuration,
  }) => {
    'backgroundRemovalMode': tray || animated ? 'none' : background,
    'backgroundRemovalThreshold': document.threshold.round(),
    'backgroundRemovalFeather': document.feather.round(),
    'backgroundRemovalCleanupSpeckles': document.cleanup,
    'backgroundRemovalSpeckleSize': document.speckle.round(),
    if (includeEmptyMetadata || emojis.trim().isNotEmpty)
      'emojis': emojis
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .take(3)
          .toList(),
    if (includeEmptyMetadata || accessibilityText.trim().isNotEmpty)
      'accessibilityText': accessibilityText.trim(),
    if (!animated && optimize && !tray) 'staticQuality': quality.round(),
    if (animated && !tray) ...{
      'animatedTrimStart': bakedDuration == null ? trimStart : 0,
      'animatedTrimEnd': bakedDuration ?? trimEnd,
      'animatedFrameRate': fps.round(),
      if (animatedCompress) 'animatedQuality': quality.round(),
    },
  };
}

class EditedMedia {
  final Uint8List bytes;
  final String name;
  final Json options;
  final EditorRecipe? recipe;
  final bool applyToAll;
  EditedMedia(
    this.bytes,
    this.name,
    this.options, {
    this.recipe,
    this.applyToAll = false,
  });
}

class SampledFrame {
  final int index, centiseconds;
  const SampledFrame(this.index, this.centiseconds);
}

class AnimationTiming {
  final List<int> durations;
  late final List<int> ends = () {
    var total = 0;
    return durations
        .map((duration) => total += duration <= 0 ? 100 : duration)
        .toList();
  }();
  AnimationTiming(this.durations);
  double get seconds => ends.isEmpty ? 0 : ends.last / 1000;
  int frameAt(double seconds) {
    var lo = 0, hi = ends.length - 1;
    final ms = (seconds * 1000).floor();
    while (lo < hi) {
      final mid = (lo + hi) ~/ 2;
      if (ms < ends[mid]) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return lo;
  }

  List<SampledFrame> sample(double start, double end, int fps) {
    if (durations.isEmpty ||
        fps < 1 ||
        fps > 30 ||
        start < 0 ||
        end <= start ||
        end > seconds + .001 ||
        end - start > 10.001) {
      throw const FormatException(
        'Choose a valid animation trim of up to 10 seconds',
      );
    }
    final total = ((end - start) * 100).round().clamp(1, 1000);
    final frames = <SampledFrame>[];
    for (var i = 0; ; i++) {
      final from = (i * 100 / fps).round();
      if (from >= total) break;
      final to = ((i + 1) * 100 / fps).round().clamp(0, total);
      if (to <= from) continue;
      final index = frameAt(start + i / fps), duration = to - from;
      if (frames.isNotEmpty && frames.last.index == index) {
        final previous = frames.removeLast();
        frames.add(SampledFrame(index, previous.centiseconds + duration));
      } else {
        frames.add(SampledFrame(index, duration));
      }
    }
    if (frames.length == 1 && total >= 2) {
      final first = frames.removeLast();
      frames.add(SampledFrame(first.index, total ~/ 2));
      frames.add(SampledFrame(first.index, total - total ~/ 2));
    }
    return frames;
  }
}

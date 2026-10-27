import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'editor_document.dart';

class MediaPainter extends CustomPainter {
  final ui.Image source;
  final EditDocument doc;
  final bool cropOverlay;
  final int? selected;
  MediaPainter(this.source, this.doc, this.cropOverlay, this.selected);
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.save();
    canvas.clipRect(rect);
    final s = doc.grayscale ? 0.0 : doc.saturation,
        c = doc.contrast,
        b = (doc.brightness + (1 - c) / 2) * 255;
    final r = .2126 * (1 - s), g = .7152 * (1 - s), bl = .0722 * (1 - s);
    final paint = Paint()
      ..filterQuality = FilterQuality.high
      ..colorFilter = ColorFilter.matrix([
        (r + s) * c,
        g * c,
        bl * c,
        0,
        b + doc.warmth * 30,
        r * c,
        (g + s) * c,
        bl * c,
        0,
        b + doc.tint * 30,
        r * c,
        g * c,
        (bl + s) * c,
        0,
        b - doc.warmth * 30,
        0,
        0,
        0,
        1,
        0,
      ]);
    final fit = applyBoxFit(
      BoxFit.contain,
      Size(source.width.toDouble(), source.height.toDouble()),
      size,
    );
    final fitRect = Alignment.center.inscribe(fit.destination, rect);
    final scale = doc.imageScale * (doc.autoFit ? 1 - doc.padding * 2 : 1);
    final target = Rect.fromCenter(
      center:
          fitRect.center +
          Offset(
            doc.imageOffset.dx * size.width,
            doc.imageOffset.dy * size.height,
          ),
      width: fitRect.width * scale,
      height: fitRect.height * scale,
    );
    void original() {
      canvas.save();
      canvas.translate(size.width / 2, size.height / 2);
      canvas.rotate(doc.rotation * math.pi / 2);
      canvas.translate(-size.width / 2, -size.height / 2);
      canvas.drawImageRect(
        source,
        Rect.fromLTWH(0, 0, source.width.toDouble(), source.height.toDouble()),
        target,
        paint,
      );
      canvas.restore();
    }

    void subject() {
      canvas.saveLayer(rect, Paint());
      original();
      for (final stroke in doc.strokes) {
        if (stroke.points.isEmpty) continue;
        final path = Path()
          ..moveTo(
            stroke.points.first.dx * size.width,
            stroke.points.first.dy * size.height,
          );
        for (final p in stroke.points.skip(1)) {
          path.lineTo(p.dx * size.width, p.dy * size.height);
        }
        if (stroke.points.length == 1) {
          path.lineTo(
            stroke.points.first.dx * size.width + .01,
            stroke.points.first.dy * size.height,
          );
        }
        final width = stroke.width * size.width;
        if (stroke.restore) {
          final mask = Path();
          for (final p in stroke.points) {
            mask.addOval(
              Rect.fromCircle(
                center: Offset(p.dx * size.width, p.dy * size.height),
                radius: width / 2,
              ),
            );
          }
          canvas.save();
          canvas.clipPath(mask);
          original();
          canvas.restore();
        } else {
          canvas.drawPath(
            path,
            Paint()
              ..blendMode = BlendMode.clear
              ..style = PaintingStyle.stroke
              ..strokeWidth = width
              ..strokeCap = StrokeCap.round
              ..strokeJoin = StrokeJoin.round,
          );
        }
      }
      canvas.restore();
    }

    if (doc.shadow) {
      canvas.saveLayer(
        rect,
        Paint()
          ..colorFilter = const ColorFilter.mode(
            Color(0x66000000),
            BlendMode.srcIn,
          )
          ..imageFilter = ui.ImageFilter.blur(
            sigmaX: size.width * .015,
            sigmaY: size.width * .015,
          ),
      );
      canvas.save();
      canvas.translate(size.width * .012, size.height * .018);
      subject();
      canvas.restore();
      canvas.restore();
    }
    if (doc.outline) {
      canvas.saveLayer(
        rect,
        Paint()
          ..colorFilter = const ColorFilter.mode(Colors.white, BlendMode.srcIn)
          ..imageFilter = ui.ImageFilter.dilate(
            radiusX: doc.outlineWidth * size.width / 512,
            radiusY: doc.outlineWidth * size.height / 512,
          ),
      );
      subject();
      canvas.restore();
    }
    subject();
    for (var i = 0; i < doc.texts.length; i++) {
      final text = doc.texts[i],
          position = Offset(
            text.position.dx * size.width,
            text.position.dy * size.height,
          );
      final stroke = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = text.strokeWidth * size.width / 512
        ..color = text.strokeColor;
      final style = TextStyle(
        fontSize: text.size * size.width,
        fontWeight: FontWeight.w800,
        height: 1,
      );
      final outline = TextPainter(
        text: TextSpan(
          text: text.text,
          style: style.copyWith(foreground: stroke),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: size.width);
      final fill = TextPainter(
        text: TextSpan(
          text: text.text,
          style: style.copyWith(color: text.color),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: size.width);
      canvas.save();
      canvas.translate(position.dx, position.dy);
      canvas.rotate(text.rotation * math.pi / 180);
      final origin = -Offset(fill.width / 2, fill.height / 2);
      if (text.strokeWidth > 0) outline.paint(canvas, origin);
      fill.paint(canvas, origin);
      if (selected == i) {
        canvas.drawRect(
          origin & fill.size,
          Paint()
            ..style = PaintingStyle.stroke
            ..color = Colors.tealAccent
            ..strokeWidth = 1,
        );
      }
      canvas.restore();
    }
    if (cropOverlay) {
      final crop = Rect.fromLTRB(
        doc.crop.left * size.width,
        doc.crop.top * size.height,
        doc.crop.right * size.width,
        doc.crop.bottom * size.height,
      );
      canvas.drawPath(
        Path.combine(
          PathOperation.difference,
          Path()..addRect(rect),
          Path()..addRect(crop),
        ),
        Paint()..color = Colors.black54,
      );
      canvas.drawRect(
        crop,
        Paint()
          ..color = Colors.white
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
      for (final p in [
        crop.topLeft,
        crop.topRight,
        crop.bottomLeft,
        crop.bottomRight,
      ]) {
        canvas.drawCircle(p, 6, Paint()..color = Colors.tealAccent);
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

class ViewportPainter extends CustomPainter {
  final ui.Image? source;
  final EditDocument doc;
  final bool crop, text;
  final Offset pan;
  final double zoom;
  final int selected;
  ViewportPainter(
    this.source,
    this.doc,
    this.crop,
    this.pan,
    this.zoom,
    this.selected,
    this.text,
  );
  @override
  void paint(Canvas canvas, Size size) {
    if (source == null) return;
    final side = math.min(size.width, size.height) * .90;
    canvas.save();
    canvas.translate(
      (size.width - side) / 2 + pan.dx,
      (size.height - side) / 2 + pan.dy,
    );
    canvas.translate(side / 2, side / 2);
    canvas.scale(zoom);
    canvas.translate(-side / 2, -side / 2);
    for (double y = 0; y < side; y += 16) {
      for (double x = 0; x < side; x += 16) {
        canvas.drawRect(
          Rect.fromLTWH(x, y, 16, 16),
          Paint()
            ..color = ((x / 16).floor() + (y / 16).floor()).isEven
                ? const Color(0xffdce4e3)
                : const Color(0xfff4f7f6),
        );
      }
    }
    MediaPainter(
      source!,
      doc,
      crop,
      text ? selected : null,
    ).paint(canvas, Size.square(side));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

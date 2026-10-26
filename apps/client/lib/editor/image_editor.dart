import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image/image.dart' as image;

import '../core/api.dart';

enum EditorTool {
  move,
  crop,
  text,
  erase,
  restore,
  adjust,
  background,
  animation,
}

class InkStroke {
  final List<Offset> points;
  final double width;
  final bool restore;
  InkStroke(this.points, this.width, this.restore);
}

class TextLayer {
  String text;
  Offset position;
  double size;
  TextLayer(this.text, this.position, this.size);
  TextLayer copy() => TextLayer(text, position, size);
}

class EditDocument {
  int rotation = 0;
  Rect crop = const Rect.fromLTWH(0, 0, 1, 1);
  double brightness = 0, contrast = 1, saturation = 1;
  bool grayscale = false;
  List<InkStroke> strokes = [];
  List<TextLayer> texts = [];
  EditDocument copy() => EditDocument()
    ..rotation = rotation
    ..crop = crop
    ..brightness = brightness
    ..contrast = contrast
    ..saturation = saturation
    ..grayscale = grayscale
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
      grayscale ||
      strokes.isNotEmpty ||
      texts.isNotEmpty;
}

class EditedMedia {
  final Uint8List bytes;
  final String name;
  final Json options;
  EditedMedia(this.bytes, this.name, this.options);
}

Future<EditedMedia?> editMedia(
  BuildContext context,
  Uint8List bytes,
  String name, {
  bool animated = false,
  bool tray = false,
}) => Navigator.of(context).push<EditedMedia>(
  MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) =>
        ImageEditor(bytes: bytes, name: name, animated: animated, tray: tray),
  ),
);

class ImageEditor extends StatefulWidget {
  final Uint8List bytes;
  final String name;
  final bool animated, tray;
  const ImageEditor({
    super.key,
    required this.bytes,
    required this.name,
    this.animated = false,
    this.tray = false,
  });
  @override
  State<ImageEditor> createState() => _ImageEditorState();
}

class _ImageEditorState extends State<ImageEditor> {
  ui.Image? preview;
  EditDocument doc = EditDocument();
  final List<EditDocument> undo = [], redo = [];
  EditorTool tool = EditorTool.move;
  final emoji = TextEditingController(), alt = TextEditingController();
  double brush = .05, zoom = 1, baseZoom = 1;
  Offset pan = Offset.zero,
      basePan = Offset.zero,
      startFocal = Offset.zero,
      startPoint = Offset.zero;
  Rect startCrop = const Rect.fromLTWH(0, 0, 1, 1);
  int selectedText = -1, cropCorner = -1;
  String background = 'none';
  double threshold = 238, feather = 14, speckle = 24, fps = 15, quality = 80;
  bool cleanup = true, exporting = false, compare = false;
  RangeValues trim = const RangeValues(0, 1);
  double duration = 1;
  String? failure;
  double exportProgress = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final codec = await ui.instantiateImageCodec(
        widget.bytes,
        targetWidth: 1024,
      );
      final frame = await codec.getNextFrame();
      double seconds = frame.duration.inMilliseconds * codec.frameCount / 1000;
      codec.dispose();
      if (!mounted) {
        frame.image.dispose();
        return;
      }
      setState(() {
        preview = frame.image;
        duration = math.max(.1, seconds);
        trim = RangeValues(0, math.min(10, duration));
      });
    } catch (_) {
      if (mounted) {
        setState(() => failure = 'This file could not be decoded as an image.');
      }
    }
  }

  @override
  void dispose() {
    preview?.dispose();
    emoji.dispose();
    alt.dispose();
    super.dispose();
  }

  void checkpoint() {
    undo.add(doc.copy());
    if (undo.length > 40) undo.removeAt(0);
    redo.clear();
  }

  void change(VoidCallback action) {
    checkpoint();
    setState(action);
  }

  void history(bool back) {
    final from = back ? undo : redo, to = back ? redo : undo;
    if (from.isEmpty) return;
    setState(() {
      to.add(doc.copy());
      doc = from.removeLast();
    });
  }

  Offset point(Offset local, Size size) {
    final side = math.min(size.width, size.height) * .90;
    final origin =
        Offset((size.width - side) / 2, (size.height - side) / 2) + pan;
    return Offset(
      ((local.dx - origin.dx - side / 2) / zoom + side / 2) / side,
      ((local.dy - origin.dy - side / 2) / zoom + side / 2) / side,
    );
  }

  Future<void> text({int? index}) async {
    var draft = index == null ? '' : doc.texts[index].text;
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sticker text'),
        content: TextFormField(
          initialValue: draft,
          onChanged: (value) => draft = value,
          autofocus: true,
          maxLength: 80,
          decoration: const InputDecoration(labelText: 'Text'),
          onFieldSubmitted: (s) => Navigator.pop(context, s),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, draft),
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    if (value == null || !mounted) return;
    change(() {
      if (index == null) {
        doc.texts.add(TextLayer(value, const Offset(.5, .8), .09));
        selectedText = doc.texts.length - 1;
      } else {
        doc.texts[index].text = value;
      }
      tool = EditorTool.text;
    });
  }

  Future<void> save() async {
    if (preview == null || exporting) return;
    setState(() {
      exporting = true;
      failure = null;
      exportProgress = 0;
    });
    try {
      Uint8List bytes = widget.bytes;
      String name = widget.name;
      if (doc.transformed || widget.tray) {
        final codec = await ui.instantiateImageCodec(
          widget.bytes,
          targetWidth: 1024,
        );
        try {
          final count = widget.animated && !widget.tray ? codec.frameCount : 1;
          if (count * 512 * 512 > 20000000) {
            throw StateError(
              'This animation has too many frames for local edits. Upload without image edits, or trim it first.',
            );
          }
          image.Image? animation;
          for (var i = 0; i < count; i++) {
            final frame = await codec.getNextFrame();
            final recorder = ui.PictureRecorder();
            final canvas = Canvas(recorder);
            const size = Size(512, 512);
            final crop = doc.crop;
            final scale = 1 / math.max(crop.width, crop.height);
            canvas.translate(256, 256);
            canvas.scale(scale);
            canvas.translate(-crop.center.dx * 512, -crop.center.dy * 512);
            MediaPainter(frame.image, doc, false, null).paint(canvas, size);
            final picture = recorder.endRecording();
            final output = await picture.toImage(512, 512);
            picture.dispose();
            frame.image.dispose();
            if (count == 1) {
              final data = await output.toByteData(
                format: ui.ImageByteFormat.png,
              );
              bytes = data!.buffer.asUint8List();
              name = 'edited-sticker.png';
            } else {
              final raw = await output.toByteData(
                format: ui.ImageByteFormat.rawRgba,
              );
              final converted = image.Image.fromBytes(
                width: 512,
                height: 512,
                bytes: raw!.buffer,
                numChannels: 4,
              )..frameDuration = frame.duration.inMilliseconds;
              if (animation == null) {
                animation = converted;
              } else {
                animation.addFrame(converted);
              }
            }
            output.dispose();
            if (mounted) setState(() => exportProgress = (i + 1) / count);
            await Future<void>.delayed(Duration.zero);
          }
          if (animation != null) {
            bytes = Uint8List.fromList(image.encodeGif(animation));
            name = 'edited-animation.gif';
          }
        } finally {
          codec.dispose();
        }
      }
      final options = <String, dynamic>{
        'backgroundRemovalMode': widget.tray ? 'none' : background,
        'backgroundRemovalThreshold': threshold.round(),
        'backgroundRemovalFeather': feather.round(),
        'backgroundRemovalCleanupSpeckles': cleanup,
        'backgroundRemovalSpeckleSize': speckle.round(),
        if (emoji.text.trim().isNotEmpty)
          'emojis': emoji.text
              .split(',')
              .map((s) => s.trim())
              .where((s) => s.isNotEmpty)
              .take(3)
              .toList(),
        if (alt.text.trim().isNotEmpty) 'accessibilityText': alt.text.trim(),
        if (widget.animated && !widget.tray) ...{
          'animatedTrimStart': trim.start,
          'animatedTrimEnd': trim.end,
          'animatedFrameRate': fps.round(),
          'animatedQuality': quality.round(),
        },
      };
      if (mounted) Navigator.pop(context, EditedMedia(bytes, name, options));
    } catch (e) {
      if (mounted) {
        setState(() {
          failure = e.toString();
          exporting = false;
        });
      }
    }
  }

  List<EditorTool> get tools => EditorTool.values
      .where(
        (t) =>
            (!widget.tray ||
                ![EditorTool.background, EditorTool.animation].contains(t)) &&
            (widget.animated || t != EditorTool.animation),
      )
      .toList();
  IconData icon(EditorTool tool) => switch (tool) {
    EditorTool.move => Icons.pan_tool_outlined,
    EditorTool.crop => Icons.crop,
    EditorTool.text => Icons.text_fields,
    EditorTool.erase => Icons.auto_fix_normal,
    EditorTool.restore => Icons.healing,
    EditorTool.adjust => Icons.tune,
    EditorTool.background => Icons.layers_clear,
    EditorTool.animation => Icons.animation,
  };
  String label(EditorTool tool) => switch (tool) {
    EditorTool.move => 'Move / zoom',
    EditorTool.crop => 'Crop',
    EditorTool.text => 'Text',
    EditorTool.erase => 'Erase',
    EditorTool.restore => 'Restore',
    EditorTool.adjust => 'Adjust',
    EditorTool.background => 'Background',
    EditorTool.animation => 'Animation',
  };
  void select(EditorTool value) {
    if (value == EditorTool.text && doc.texts.isEmpty) {
      text();
      return;
    }
    setState(() {
      tool = value;
      zoom = 1;
      pan = Offset.zero;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xff151d20),
    appBar: AppBar(
      title: Text(widget.tray ? 'Edit pack icon' : 'Edit sticker'),
      actions: [
        IconButton(
          tooltip: 'Undo',
          onPressed: undo.isEmpty || exporting ? null : () => history(true),
          icon: const Icon(Icons.undo),
        ),
        IconButton(
          tooltip: 'Redo',
          onPressed: redo.isEmpty || exporting ? null : () => history(false),
          icon: const Icon(Icons.redo),
        ),
        IconButton(
          tooltip: 'Compare original',
          onPressed: () => setState(() => compare = !compare),
          isSelected: compare,
          icon: const Icon(Icons.compare),
        ),
        if (MediaQuery.sizeOf(context).width < 480)
          IconButton.filled(
            tooltip: 'Use image',
            onPressed: exporting || preview == null ? null : save,
            icon: const Icon(Icons.check),
          )
        else
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: FilledButton.icon(
              onPressed: exporting || preview == null ? null : save,
              icon: const Icon(Icons.check),
              label: Text(
                exporting ? '${(exportProgress * 100).round()}%' : 'Use image',
              ),
            ),
          ),
      ],
    ),
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 900;
          final canvas = Expanded(
            child: LayoutBuilder(
              builder: (context, bounds) {
                final size = bounds.biggest;
                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onDoubleTap: () => setState(() {
                    zoom = 1;
                    pan = Offset.zero;
                  }),
                  onScaleStart: (details) {
                    baseZoom = zoom;
                    basePan = pan;
                    startFocal = details.localFocalPoint;
                    startPoint = point(startFocal, size);
                    startCrop = doc.crop;
                    cropCorner = -1;
                    if (tool == EditorTool.crop) {
                      final corners = [
                        doc.crop.topLeft,
                        doc.crop.topRight,
                        doc.crop.bottomRight,
                        doc.crop.bottomLeft,
                      ];
                      for (var i = 0; i < corners.length; i++) {
                        if ((corners[i] - startPoint).distance < .08) {
                          cropCorner = i;
                        }
                      }
                      checkpoint();
                    }
                    if ([EditorTool.erase, EditorTool.restore].contains(tool)) {
                      checkpoint();
                      doc.strokes.add(
                        InkStroke(
                          [startPoint],
                          brush,
                          tool == EditorTool.restore,
                        ),
                      );
                    }
                    if (tool == EditorTool.text && doc.texts.isNotEmpty) {
                      checkpoint();
                      selectedText = doc.texts.indexWhere(
                        (t) => (t.position - startPoint).distance < .25,
                      );
                      if (selectedText < 0) selectedText = doc.texts.length - 1;
                    }
                  },
                  onScaleUpdate: (details) {
                    setState(() {
                      if (details.pointerCount > 1 || tool == EditorTool.move) {
                        zoom = (baseZoom * details.scale).clamp(1, 6);
                        pan = basePan + details.localFocalPoint - startFocal;
                        return;
                      }
                      final p = point(details.localFocalPoint, size);
                      if ([
                            EditorTool.erase,
                            EditorTool.restore,
                          ].contains(tool) &&
                          doc.strokes.isNotEmpty) {
                        doc.strokes.last.points.add(
                          Offset(p.dx.clamp(0, 1), p.dy.clamp(0, 1)),
                        );
                      }
                      if (tool == EditorTool.text && selectedText >= 0) {
                        doc.texts[selectedText].position = Offset(
                          p.dx.clamp(0, 1),
                          p.dy.clamp(0, 1),
                        );
                      }
                      if (tool == EditorTool.crop) {
                        if (cropCorner < 0) {
                          final delta = p - startPoint;
                          final left = (startCrop.left + delta.dx).clamp(
                                0.0,
                                1 - startCrop.width,
                              ),
                              top = (startCrop.top + delta.dy).clamp(
                                0.0,
                                1 - startCrop.height,
                              );
                          doc.crop = Rect.fromLTWH(
                            left,
                            top,
                            startCrop.width,
                            startCrop.height,
                          );
                        } else {
                          final left = [0, 3].contains(cropCorner)
                              ? p.dx.clamp(0.0, startCrop.right - .1)
                              : startCrop.left;
                          final right = [1, 2].contains(cropCorner)
                              ? p.dx.clamp(startCrop.left + .1, 1.0)
                              : startCrop.right;
                          final top = [0, 1].contains(cropCorner)
                              ? p.dy.clamp(0.0, startCrop.bottom - .1)
                              : startCrop.top;
                          final bottom = [2, 3].contains(cropCorner)
                              ? p.dy.clamp(startCrop.top + .1, 1.0)
                              : startCrop.bottom;
                          doc.crop = Rect.fromLTRB(left, top, right, bottom);
                        }
                      }
                    });
                  },
                  child: ClipRect(
                    child: CustomPaint(
                      size: size,
                      painter: ViewportPainter(
                        preview,
                        compare ? EditDocument() : doc,
                        tool == EditorTool.crop,
                        pan,
                        zoom,
                        selectedText,
                        tool == EditorTool.text,
                      ),
                      child: preview == null
                          ? Center(
                              child: failure == null
                                  ? const CircularProgressIndicator()
                                  : Text(
                                      failure!,
                                      style: const TextStyle(
                                        color: Colors.white,
                                      ),
                                    ),
                            )
                          : null,
                    ),
                  ),
                );
              },
            ),
          );
          final toolbar = SingleChildScrollView(
            scrollDirection: wide ? Axis.vertical : Axis.horizontal,
            child: Flex(
              direction: wide ? Axis.vertical : Axis.horizontal,
              mainAxisSize: MainAxisSize.min,
              children: tools
                  .map(
                    (t) => Padding(
                      padding: const EdgeInsets.all(3),
                      child: IconButton.filledTonal(
                        tooltip: label(t),
                        isSelected: tool == t,
                        style: tool == t
                            ? IconButton.styleFrom(
                                backgroundColor: Theme.of(context)
                                    .colorScheme
                                    .primaryContainer,
                              )
                            : IconButton.styleFrom(
                                backgroundColor: Colors.transparent,
                              ),
                        onPressed: exporting ? null : () => select(t),
                        icon: Icon(icon(t)),
                      ),
                    ),
                  )
                  .toList(),
            ),
          );
          final controls = Container(
            width: wide ? 300 : null,
            constraints: BoxConstraints(
              maxHeight: wide ? double.infinity : 210,
            ),
            padding: const EdgeInsets.all(12),
            color: Theme.of(context).colorScheme.surface,
            child: SingleChildScrollView(child: panel()),
          );
          return Column(
            children: [
              if (exporting)
                LinearProgressIndicator(
                  value: exportProgress == 0 ? null : exportProgress,
                ),
              if (failure != null)
                MaterialBanner(
                  content: Text(failure!),
                  actions: [
                    TextButton(
                      onPressed: () => setState(() => failure = null),
                      child: const Text('Dismiss'),
                    ),
                  ],
                ),
              Expanded(
                child: wide
                    ? Row(children: [toolbar, canvas, controls])
                    : Column(
                        children: [
                          canvas,
                          controls,
                          Material(child: toolbar),
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    ),
  );

  Widget slider(
    String title,
    double value,
    double min,
    double max,
    ValueChanged<double> action,
  ) => Row(
    children: [
      SizedBox(width: 80, child: Text(title)),
      Expanded(
        child: Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          onChangeStart: (_) => checkpoint(),
          onChanged: (v) => setState(() => action(v)),
        ),
      ),
      SizedBox(width: 36, child: Text(value.toStringAsFixed(1))),
    ],
  );
  Widget panel() => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label(tool), style: Theme.of(context).textTheme.titleSmall),
      if (tool == EditorTool.move)
        const Text('Pinch to zoom, drag to pan. Double-tap to reset the view.'),
      if (tool == EditorTool.crop) ...[
        const Text(
          'Drag a corner to crop, or drag inside the frame to move it.',
        ),
        Row(
          children: [
            IconButton(
              tooltip: 'Rotate left',
              onPressed: () =>
                  change(() => doc.rotation = (doc.rotation - 1) % 4),
              icon: const Icon(Icons.rotate_left),
            ),
            IconButton(
              tooltip: 'Rotate right',
              onPressed: () =>
                  change(() => doc.rotation = (doc.rotation + 1) % 4),
              icon: const Icon(Icons.rotate_right),
            ),
            TextButton(
              onPressed: () =>
                  change(() => doc.crop = const Rect.fromLTWH(.1, .1, .8, .8)),
              child: const Text('Square'),
            ),
            TextButton(
              onPressed: () =>
                  change(() => doc.crop = const Rect.fromLTWH(0, 0, 1, 1)),
              child: const Text('Reset crop'),
            ),
          ],
        ),
      ],
      if (tool == EditorTool.text) ...[
        const Text('Drag text directly on the image.'),
        Wrap(
          children: [
            TextButton.icon(
              onPressed: text,
              icon: const Icon(Icons.add),
              label: const Text('Add text'),
            ),
            if (selectedText >= 0 && selectedText < doc.texts.length) ...[
              IconButton(
                tooltip: 'Edit selected text',
                onPressed: () => text(index: selectedText),
                icon: const Icon(Icons.edit),
              ),
              IconButton(
                tooltip: 'Delete selected text',
                onPressed: () => change(() {
                  doc.texts.removeAt(selectedText);
                  selectedText = -1;
                }),
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ],
        ),
        if (selectedText >= 0 && selectedText < doc.texts.length)
          slider(
            'Size',
            doc.texts[selectedText].size * 512,
            18,
            140,
            (v) => doc.texts[selectedText].size = v / 512,
          ),
      ],
      if ([EditorTool.erase, EditorTool.restore].contains(tool)) ...[
        const Text('Paint directly on the image. Use two fingers to zoom.'),
        slider('Brush', brush * 512, 4, 96, (v) => brush = v / 512),
      ],
      if (tool == EditorTool.adjust) ...[
        slider(
          'Brightness',
          doc.brightness,
          -.5,
          .5,
          (v) => doc.brightness = v,
        ),
        slider('Contrast', doc.contrast, .2, 2, (v) => doc.contrast = v),
        slider('Saturation', doc.saturation, 0, 2, (v) => doc.saturation = v),
        CheckboxListTile(
          dense: true,
          title: const Text('Grayscale'),
          value: doc.grayscale,
          onChanged: (v) => change(() => doc.grayscale = v!),
        ),
        TextButton(
          onPressed: () => change(() {
            doc.brightness = 0;
            doc.contrast = 1;
            doc.saturation = 1;
            doc.grayscale = false;
          }),
          child: const Text('Reset color'),
        ),
      ],
      if (tool == EditorTool.background) ...[
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'none', label: Text('None')),
            ButtonSegment(value: 'threshold', label: Text('Clean')),
            ButtonSegment(value: 'ai', label: Text('AI')),
          ],
          selected: {background},
          onSelectionChanged: (v) => setState(() => background = v.first),
        ),
        const Text(
          'Background removal is processed by your server when you save.',
        ),
        if (background != 'none') ...[
          slider('Threshold', threshold, 180, 255, (v) => threshold = v),
          slider('Feather', feather, 0, 48, (v) => feather = v),
          CheckboxListTile(
            dense: true,
            title: const Text('Clean speckles'),
            value: cleanup,
            onChanged: (v) => setState(() => cleanup = v!),
          ),
          slider('Speckles', speckle, 4, 180, (v) => speckle = v),
        ],
      ],
      if (tool == EditorTool.animation) ...[
        Text(
          'Trim ${trim.start.toStringAsFixed(1)}–${trim.end.toStringAsFixed(1)} seconds',
        ),
        RangeSlider(
          values: trim,
          min: 0,
          max: math.max(duration, .1),
          onChanged: (v) {
            if (v.end - v.start >= .1 && v.end - v.start <= 10) {
              setState(() => trim = v);
            }
          },
        ),
        slider('FPS', fps, 1, 30, (v) => fps = v),
        slider('Quality', quality, 35, 95, (v) => quality = v),
      ],
      if (!widget.tray && tool == EditorTool.move) ...[
        TextField(
          controller: emoji,
          decoration: const InputDecoration(
            labelText: 'Emojis, separated by commas',
          ),
        ),
        TextField(
          controller: alt,
          maxLength: 125,
          decoration: const InputDecoration(
            labelText: 'Accessibility description',
          ),
        ),
      ],
    ],
  );
}

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
    canvas.saveLayer(rect, Paint());
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
        b,
        r * c,
        (g + s) * c,
        bl * c,
        0,
        b,
        r * c,
        g * c,
        (bl + s) * c,
        0,
        b,
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
    final target = Alignment.center.inscribe(fit.destination, rect);
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
    for (var i = 0; i < doc.texts.length; i++) {
      final text = doc.texts[i],
          position = Offset(
            text.position.dx * size.width,
            text.position.dy * size.height,
          );
      final stroke = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = size.width * text.size * .09
        ..color = Colors.black;
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
          style: style.copyWith(color: Colors.white),
        ),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: size.width);
      final origin = position - Offset(fill.width / 2, fill.height / 2);
      outline.paint(canvas, origin);
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

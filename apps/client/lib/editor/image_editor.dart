import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'editor_document.dart';
import 'editor_painter.dart';
import 'editor_renderer.dart';
import '../ui/common.dart' show isTextEditingFocused;
export 'editor_document.dart';

enum EditorTool {
  move,
  crop,
  text,
  erase,
  restore,
  adjust,
  effects,
  background,
  animation,
  details,
}

Future<EditedMedia?> editMedia(
  BuildContext context,
  Uint8List bytes,
  String name, {
  bool animated = false,
  bool tray = false,
  bool allowBatch = false,
  EditorRecipe? initial,
}) => Navigator.of(context).push<EditedMedia>(
  MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => ImageEditor(
      bytes: bytes,
      name: name,
      animated: animated,
      tray: tray,
      allowBatch: allowBatch,
      initial: initial,
    ),
  ),
);

class ImageEditor extends StatefulWidget {
  final Uint8List bytes;
  final String name;
  final bool animated, tray, allowBatch;
  final EditorRecipe? initial;
  const ImageEditor({
    super.key,
    required this.bytes,
    required this.name,
    this.animated = false,
    this.tray = false,
    this.allowBatch = false,
    this.initial,
  });
  @override
  State<ImageEditor> createState() => _ImageEditorState();
}

class _ImageEditorState extends State<ImageEditor>
    with SingleTickerProviderStateMixin {
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
  double fps = 15, quality = 82;
  double get threshold => doc.threshold;
  set threshold(double v) => doc.threshold = v;
  double get feather => doc.feather;
  set feather(double v) => doc.feather = v;
  double get speckle => doc.speckle;
  set speckle(double v) => doc.speckle = v;
  bool get cleanup => doc.cleanup;
  set cleanup(bool v) => doc.cleanup = v;
  bool exporting = false,
      compare = false,
      optimize = false,
      compressAnimation = true,
      applyAll = false,
      playing = false;
  final frames = <ui.Image>[];
  AnimationTiming timing = AnimationTiming([]);
  late final timeline = AnimationController(vsync: this)..addListener(tick);
  int frameIndex = 0, previewEpoch = 0;
  String? preparedKey;
  RangeValues trim = const RangeValues(0, 1);
  double duration = 1;
  String? failure;
  double exportProgress = 0;
  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    if (initial != null) {
      doc = initial.document.copy();
      background = initial.background;
      fps = initial.fps;
      quality = initial.quality;
      optimize = initial.optimize;
      compressAnimation = initial.animatedCompress;
      emoji.text = initial.emojis;
      alt.text = initial.accessibilityText;
    }
    _load();
  }

  Future<void> _load() async {
    final loaded = <ui.Image>[];
    ui.Codec? codec;
    try {
      codec = await editorCodec(
        widget.bytes,
        maxSide: widget.animated ? 256 : 1024,
      );
      if (codec.frameCount > 1000) {
        throw const FormatException(
          'This animation has too many frames to edit on this device.',
        );
      }
      if (widget.animated && codec.frameCount < 2) {
        throw const FormatException(
          'Choose an animated GIF or WebP for this pack.',
        );
      }
      final count = widget.animated && !widget.tray ? codec.frameCount : 1;
      final delays = <int>[];
      for (var i = 0; i < count; i++) {
        final frame = await codec.getNextFrame();
        loaded.add(frame.image);
        delays.add(frame.duration.inMilliseconds);
        if (!mounted) throw StateError('Editor closed');
      }
      timing = AnimationTiming(delays);
      duration = widget.animated ? timing.seconds : 1;
      frames.addAll(loaded);
      loaded.clear();
      final start = (widget.initial?.trimStart ?? 0.0)
          .clamp(0.0, math.max(0.0, duration - .1))
          .toDouble();
      trim = RangeValues(
        start,
        (widget.initial?.trimEnd ?? 10).clamp(start + .01, duration),
      );
      timeline.duration = Duration(
        milliseconds: math.max(1, (duration * 1000).round()),
      );
      timeline.value = trim.start / duration;
      frameIndex = widget.animated ? timing.frameAt(trim.start) : 0;
      await updatePreview();
    } catch (e) {
      if (mounted) setState(() => failure = 'Could not open image: $e');
    } finally {
      codec?.dispose();
      for (final frame in loaded) {
        frame.dispose();
      }
    }
  }

  Future<void> updatePreview() async {
    if (frames.isEmpty || !mounted) return;
    final key = '$frameIndex/${doc.pixelSignature}';
    if (key == preparedKey) return;
    preparedKey = key;
    final epoch = ++previewEpoch;
    try {
      final value = await prepareEditorFrame(frames[frameIndex], doc.copy());
      if (!mounted || epoch != previewEpoch) {
        value.dispose();
        return;
      }
      final old = preview;
      setState(() => preview = value);
      old?.dispose();
    } catch (e) {
      if (mounted && epoch == previewEpoch) {
        preparedKey = null;
        setState(() => failure = 'Preview failed: $e');
      }
    }
  }

  void tick() {
    if (!mounted || frames.isEmpty || !widget.animated) return;
    final next = timing.frameAt(timeline.value * duration);
    if (next != frameIndex) {
      frameIndex = next;
      updatePreview();
    }
    setState(() {});
  }

  void play() {
    setState(() => playing = !playing);
    if (playing) {
      timeline.repeat(
        min: trim.start / duration,
        max: trim.end / duration,
        period: Duration(
          milliseconds: ((trim.end - trim.start) * 1000).round(),
        ),
      );
    } else {
      timeline.stop();
    }
  }

  void seek(double seconds) {
    timeline.stop();
    playing = false;
    timeline.value = (seconds / duration).clamp(0, 1);
    tick();
  }

  EditorRecipe get recipe => EditorRecipe(
    document: doc.copy(),
    background: background,
    emojis: emoji.text,
    accessibilityText: alt.text,
    trimStart: trim.start,
    trimEnd: trim.end,
    fps: fps,
    quality: quality,
    optimize: optimize,
    animatedCompress: compressAnimation,
    includeEmptyMetadata: widget.initial?.includeEmptyMetadata ?? false,
  );

  @override
  void dispose() {
    previewEpoch++;
    timeline.dispose();
    preview?.dispose();
    for (final frame in frames) {
      frame.dispose();
    }
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
    updatePreview();
  }

  void history(bool back) {
    final from = back ? undo : redo, to = back ? redo : undo;
    if (from.isEmpty) return;
    setState(() {
      to.add(doc.copy());
      doc = from.removeLast();
    });
    updatePreview();
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
    timeline.stop();
    playing = false;
    setState(() {
      exporting = true;
      failure = null;
      exportProgress = 0;
    });
    try {
      final media = await renderEditedMedia(
        widget.bytes,
        widget.name,
        recipe,
        animated: widget.animated,
        tray: widget.tray,
        progress: (value) {
          if (mounted) setState(() => exportProgress = value);
        },
        cancelled: () => !mounted,
      );
      if (mounted) {
        Navigator.pop(
          context,
          EditedMedia(
            media.bytes,
            media.name,
            media.options,
            recipe: media.recipe,
            applyToAll: applyAll,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          failure = e.toString();
          exporting = false;
        });
      }
    }
  }

  KeyEventResult keyboard(FocusNode _, KeyEvent event) {
    if (event is! KeyDownEvent || exporting || isTextEditingFocused()) {
      return KeyEventResult.ignored;
    }
    final modifier =
            HardwareKeyboard.instance.isControlPressed ||
            HardwareKeyboard.instance.isMetaPressed,
        key = event.logicalKey;
    if (modifier && key == LogicalKeyboardKey.keyZ) {
      history(!HardwareKeyboard.instance.isShiftPressed);
      return KeyEventResult.handled;
    }
    if (modifier && key == LogicalKeyboardKey.keyY) {
      history(false);
      return KeyEventResult.handled;
    }
    if (modifier && key == LogicalKeyboardKey.keyS) {
      save();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.space && widget.animated) {
      play();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Future<void> color(bool stroke) async {
    if (selectedText < 0 || selectedText >= doc.texts.length) return;
    final layer = doc.texts[selectedText];
    var draft =
        '#${(stroke ? layer.strokeColor : layer.color).toARGB32().toRadixString(16).substring(2)}';
    final value = await showDialog<Color>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(stroke ? 'Text outline color' : 'Text fill color'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Wrap(
              children: [
                for (final color in [
                  Colors.white,
                  Colors.black,
                  Colors.red,
                  Colors.amber,
                  Colors.blue,
                  Colors.green,
                ])
                  IconButton(
                    tooltip:
                        '#${color.toARGB32().toRadixString(16).substring(2)}',
                    onPressed: () => Navigator.pop(c, color),
                    icon: Icon(Icons.circle, color: color),
                  ),
              ],
            ),
            TextFormField(
              initialValue: draft,
              decoration: const InputDecoration(
                labelText: 'Hex color (#RRGGBB)',
              ),
              onChanged: (v) => draft = v,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(draft)) {
                Navigator.pop(
                  c,
                  Color(int.parse(draft.substring(1), radix: 16) | 0xff000000),
                );
              }
            },
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    if (value != null && mounted) {
      change(() {
        if (stroke) {
          layer.strokeColor = value;
        } else {
          layer.color = value;
        }
      });
    }
  }

  List<EditorTool> get tools => EditorTool.values
      .where(
        (t) =>
            (!widget.tray ||
                ![
                  EditorTool.background,
                  EditorTool.animation,
                  EditorTool.details,
                ].contains(t)) &&
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
    EditorTool.effects => Icons.auto_awesome_outlined,
    EditorTool.background => Icons.layers_clear,
    EditorTool.animation => Icons.animation,
    EditorTool.details => Icons.info_outline,
  };
  String label(EditorTool tool) => switch (tool) {
    EditorTool.move => 'Move / zoom',
    EditorTool.crop => 'Crop',
    EditorTool.text => 'Text',
    EditorTool.erase => 'Erase',
    EditorTool.restore => 'Restore',
    EditorTool.adjust => 'Adjust',
    EditorTool.effects => 'Effects',
    EditorTool.background => 'Background',
    EditorTool.animation => 'Animation',
    EditorTool.details => 'Sticker details',
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
  Widget build(BuildContext context) => Focus(
    autofocus: true,
    onKeyEvent: keyboard,
    child: Scaffold(
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
                  exporting
                      ? '${(exportProgress * 100).round()}%'
                      : 'Use image',
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
                      if (details.pointerCount > 1) return;
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
                      if ([
                        EditorTool.erase,
                        EditorTool.restore,
                      ].contains(tool)) {
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
                        if (selectedText < 0) {
                          selectedText = doc.texts.length - 1;
                        }
                      }
                    },
                    onScaleUpdate: (details) {
                      setState(() {
                        if (details.pointerCount > 1 ||
                            tool == EditorTool.move) {
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
                          compare && frames.isNotEmpty
                              ? frames[frameIndex]
                              : preview,
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
              width: wide ? 300 : double.infinity,
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
          onChanged: (v) {
            setState(() => action(v));
            updatePreview();
          },
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
      if (tool == EditorTool.move) ...[
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            PopupMenuButton<String>(
              tooltip: 'Image presets',
              onSelected: (name) => change(() {
                doc.preset(name);
                if (doc.texts.isNotEmpty) selectedText = doc.texts.length - 1;
              }),
              itemBuilder: (_) => ['Meme cutout', 'Soft shadow', 'Bold outline']
                  .map((name) => PopupMenuItem(value: name, child: Text(name)))
                  .toList(),
              child: const Padding(
                padding: EdgeInsets.all(8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.auto_awesome_outlined),
                    SizedBox(width: 6),
                    Text('Presets'),
                  ],
                ),
              ),
            ),
            TextButton(
              onPressed: () => change(() {
                doc = EditDocument();
                selectedText = -1;
                background = 'none';
                fps = 15;
                quality = 82;
                optimize = false;
                compressAnimation = true;
                trim = RangeValues(0, math.min(10, duration));
                seek(0);
              }),
              child: const Text('Reset all'),
            ),
          ],
        ),
        const Text('Pinch to zoom, drag to pan. Double-tap to reset the view.'),
      ],
      if (widget.allowBatch)
        CheckboxListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: const Text('Apply these edits to all selected images'),
          value: applyAll,
          onChanged: (v) => setState(() => applyAll = v!),
        ),
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
      if (tool == EditorTool.crop) ...[
        slider('Image zoom', doc.imageScale, .25, 3, (v) => doc.imageScale = v),
        slider(
          'Offset X',
          doc.imageOffset.dx * 100,
          -100,
          100,
          (v) => doc.imageOffset = Offset(v / 100, doc.imageOffset.dy),
        ),
        slider(
          'Offset Y',
          doc.imageOffset.dy * 100,
          -100,
          100,
          (v) => doc.imageOffset = Offset(doc.imageOffset.dx, v / 100),
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
      if (tool == EditorTool.text &&
          selectedText >= 0 &&
          selectedText < doc.texts.length) ...[
        Wrap(
          children: [
            TextButton.icon(
              onPressed: () => color(false),
              icon: Icon(Icons.circle, color: doc.texts[selectedText].color),
              label: const Text('Fill'),
            ),
            TextButton.icon(
              onPressed: () => color(true),
              icon: Icon(
                Icons.circle_outlined,
                color: doc.texts[selectedText].strokeColor,
              ),
              label: const Text('Outline'),
            ),
          ],
        ),
        slider(
          'Text angle',
          doc.texts[selectedText].rotation,
          -180,
          180,
          (v) => doc.texts[selectedText].rotation = v,
        ),
        slider(
          'Stroke',
          doc.texts[selectedText].strokeWidth,
          0,
          12,
          (v) => doc.texts[selectedText].strokeWidth = v,
        ),
      ],
      if (tool == EditorTool.effects) ...[
        CheckboxListTile(
          dense: true,
          title: const Text('Auto-fit subject'),
          value: doc.autoFit,
          onChanged: (v) => change(() => doc.autoFit = v!),
        ),
        if (doc.autoFit)
          slider(
            'Padding',
            doc.padding * 100,
            0,
            30,
            (v) => doc.padding = v / 100,
          ),
        CheckboxListTile(
          dense: true,
          title: const Text('White outline'),
          value: doc.outline,
          onChanged: (v) => change(() => doc.outline = v!),
        ),
        if (doc.outline)
          slider(
            'Outline',
            doc.outlineWidth,
            1,
            16,
            (v) => doc.outlineWidth = v,
          ),
        CheckboxListTile(
          dense: true,
          title: const Text('Soft shadow'),
          value: doc.shadow,
          onChanged: (v) => change(() => doc.shadow = v!),
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
        slider('Warmth', doc.warmth, -1, 1, (v) => doc.warmth = v),
        slider('Tint', doc.tint, -1, 1, (v) => doc.tint = v),
        slider('Sharpen', doc.sharpen, 0, 1, (v) => doc.sharpen = v),
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
            doc.warmth = 0;
            doc.tint = 0;
            doc.sharpen = 0;
          }),
          child: const Text('Reset color'),
        ),
      ],
      if (tool == EditorTool.background) ...[
        CheckboxListTile(
          dense: true,
          title: const Text('Remove light background locally'),
          value: doc.removeLightBackground,
          onChanged: (v) => change(() => doc.removeLightBackground = v!),
        ),
        if (widget.animated)
          const Text(
            'Local cleanup applies to every frame; server AI cleanup is for static stickers.',
          ),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'none', label: Text('None')),
            ButtonSegment(value: 'threshold', label: Text('Clean')),
            ButtonSegment(value: 'ai', label: Text('AI')),
          ],
          selected: {background},
          onSelectionChanged: widget.animated
              ? null
              : (v) => setState(() => background = v.first),
        ),
        const Text(
          'Background removal is processed by your server when you save.',
        ),
        if (background != 'none' || doc.removeLightBackground) ...[
          slider('Threshold', threshold, 180, 255, (v) => threshold = v),
          slider('Feather', feather, 0, 48, (v) => feather = v),
          CheckboxListTile(
            dense: true,
            title: const Text('Clean speckles'),
            value: cleanup,
            onChanged: (v) => change(() => cleanup = v!),
          ),
          slider('Speckles', speckle, 4, 180, (v) => speckle = v),
        ],
      ],
      if (tool == EditorTool.animation) ...[
        Row(
          children: [
            IconButton(
              tooltip: playing ? 'Pause animation' : 'Play animation',
              onPressed: frames.length > 1 ? play : null,
              icon: Icon(playing ? Icons.pause : Icons.play_arrow),
            ),
            Expanded(
              child: Slider(
                semanticFormatterCallback: (v) =>
                    '${v.toStringAsFixed(2)} seconds',
                value: timeline.value * duration,
                min: 0,
                max: duration,
                onChanged: seek,
              ),
            ),
            Text('${(timeline.value * duration).toStringAsFixed(2)}s'),
          ],
        ),
        Text(
          '${frames.length} frames · ${duration.toStringAsFixed(2)} seconds',
        ),
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
              seek(v.start);
            }
          },
        ),
        slider('FPS', fps, 1, 30, (v) => fps = v),
        CheckboxListTile(
          dense: true,
          title: const Text('Compress animation'),
          value: compressAnimation,
          onChanged: (v) => setState(() => compressAnimation = v!),
        ),
        if (compressAnimation)
          slider('Quality', quality, 35, 95, (v) => quality = v),
      ],
      if (!widget.tray && !widget.animated && tool == EditorTool.effects) ...[
        CheckboxListTile(
          dense: true,
          title: const Text('Optimize output size'),
          value: optimize,
          onChanged: (v) => setState(() => optimize = v!),
        ),
        if (optimize) slider('Quality', quality, 35, 95, (v) => quality = v),
      ],
      if (tool == EditorTool.details) ...[
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

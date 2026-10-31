import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';

class StickerGrid extends StatefulWidget {
  final List<Json> stickers;
  final Set<String> selected;
  final bool editable, public, showSlots;
  final String? focusId;
  final Widget? tray;
  final VoidCallback? changeTray, add;
  final Widget Function(Json) image;
  final void Function(Json) open;
  final void Function(String, bool) select;
  final void Function(String, String) drop;
  final void Function(String, Json) action;
  const StickerGrid({
    super.key,
    required this.stickers,
    required this.selected,
    required this.editable,
    required this.public,
    required this.image,
    required this.open,
    required this.select,
    required this.drop,
    required this.action,
    this.focusId,
    this.tray,
    this.changeTray,
    this.add,
    this.showSlots = false,
  });
  @override
  State<StickerGrid> createState() => _StickerGridState();
}

class _StickerGridState extends State<StickerGrid> {
  final scroll = ScrollController();
  final viewport = GlobalKey();
  final keys = <String, GlobalKey>{};
  Timer? autoScroll;
  double scrollDelta = 0, tileSize = 120, headerExtent = 0;
  int columns = 3;

  void stopScroll() {
    autoScroll?.cancel();
    autoScroll = null;
    scrollDelta = 0;
  }

  void dragUpdate(DragUpdateDetails details) {
    final box = viewport.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !scroll.hasClients) return;
    final y = box.globalToLocal(details.globalPosition).dy;
    scrollDelta = y < 64
        ? -12
        : y > box.size.height - 64
        ? 12
        : 0;
    if (scrollDelta == 0) {
      stopScroll();
      return;
    }
    autoScroll ??= Timer.periodic(const Duration(milliseconds: 40), (_) {
      if (!mounted || !scroll.hasClients) {
        stopScroll();
        return;
      }
      scroll.jumpTo(
        (scroll.offset + scrollDelta).clamp(0, scroll.position.maxScrollExtent),
      );
    });
  }

  @override
  void dispose() {
    stopScroll();
    scroll.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant StickerGrid old) {
    super.didUpdateWidget(old);
    if (!widget.editable) stopScroll();
    if (old.focusId != widget.focusId && widget.focusId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !scroll.hasClients) return;
        final index = widget.stickers.indexWhere(
          (s) => s['id'] == widget.focusId,
        );
        if (index < 0) return;
        final target = keys[widget.focusId]?.currentContext;
        if (target != null) {
          final box = target.findRenderObject() as RenderBox?;
          final view =
              viewport.currentContext?.findRenderObject() as RenderBox?;
          if (box != null && view != null) {
            final top = view.globalToLocal(box.localToGlobal(Offset.zero)).dy;
            if (top >= 0 && top + box.size.height <= view.size.height) return;
          }
          Scrollable.ensureVisible(
            target,
            duration: const Duration(milliseconds: 150),
            alignment: .5,
          );
        } else {
          scroll.animateTo(
            (headerExtent + (index ~/ columns) * (tileSize + 10)).clamp(
              0,
              scroll.position.maxScrollExtent,
            ),
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  Widget feedback(Json sticker) => Material(
    elevation: 8,
    borderRadius: BorderRadius.circular(12),
    child: SizedBox(
      width: tileSize,
      height: tileSize,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: widget.image(sticker),
      ),
    ),
  );

  List<PopupMenuEntry<String>> menu() => [
    if (widget.editable) ...[
      const PopupMenuItem(value: 'edit', child: Text('Edit image')),
      const PopupMenuItem(value: 'replace', child: Text('Replace image')),
      const PopupMenuItem(
        value: 'details',
        child: Text('Emoji, description & review'),
      ),
      const PopupMenuItem(value: 'select', child: Text('Select')),
      const PopupMenuItem(value: 'up', child: Text('Move earlier')),
      const PopupMenuItem(value: 'down', child: Text('Move later')),
      const PopupMenuItem(value: 'delete', child: Text('Delete')),
    ],
    const PopupMenuItem(value: 'comments', child: Text('Comments')),
  ];

  Widget slot(BuildContext context, int index) {
    final colors = Theme.of(context).colorScheme;
    return OutlinedButton(
      key: ValueKey('empty-slot-$index'),
      onPressed: widget.add,
      style: OutlinedButton.styleFrom(
        padding: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide(color: colors.outlineVariant),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Center(
            child: Icon(
              Icons.add_photo_alternate_outlined,
              size: 30,
              semanticLabel: 'Add sticker ${index + 1}',
            ),
          ),
          Positioned(
            top: 6,
            left: 8,
            child: Text(
              '${index + 1}',
              style: TextStyle(fontSize: 11, color: colors.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }

  Widget stickerTile(BuildContext context, int index) {
    final sticker = widget.stickers[index], id = sticker['id'] as String;
    final selected = widget.selected.contains(id);
    final colors = Theme.of(context).colorScheme;
    return DragTarget<String>(
      key: keys.putIfAbsent(id, () => GlobalKey()),
      onWillAcceptWithDetails: (d) =>
          widget.editable &&
          d.data != id &&
          widget.stickers.any((s) => s['id'] == d.data),
      onAcceptWithDetails: (d) {
        stopScroll();
        widget.drop(d.data, id);
      },
      builder: (context, candidates, _) {
        final picture = InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            if (widget.editable &&
                (widget.selected.isNotEmpty ||
                    HardwareKeyboard.instance.isControlPressed ||
                    HardwareKeyboard.instance.isMetaPressed ||
                    HardwareKeyboard.instance.isShiftPressed)) {
              widget.select(id, HardwareKeyboard.instance.isShiftPressed);
            } else {
              widget.open(sticker);
            }
          },
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: widget.image(sticker),
          ),
        );
        return Card(
          key: ValueKey('sticker-$id'),
          margin: EdgeInsets.zero,
          elevation: 0,
          color: selected || candidates.isNotEmpty
              ? colors.secondaryContainer
              : colors.surfaceContainerLow,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
              color: selected || candidates.isNotEmpty
                  ? colors.primary
                  : colors.outlineVariant,
              width: selected || candidates.isNotEmpty ? 2 : 1,
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (widget.editable)
                LongPressDraggable<String>(
                  data: id,
                  feedback: feedback(sticker),
                  onDragUpdate: dragUpdate,
                  onDragEnd: (_) => stopScroll(),
                  onDraggableCanceled: (_, _) => stopScroll(),
                  childWhenDragging: Opacity(opacity: .3, child: picture),
                  child: picture,
                )
              else
                picture,
              Positioned(
                top: 6,
                left: 7,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: colors.primaryContainer,
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    child: Text(
                      '${index + 1}',
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.onPrimaryContainer,
                      ),
                    ),
                  ),
                ),
              ),
              if (!widget.public)
                Positioned(
                  top: 0,
                  right: 0,
                  child: SizedBox(
                    width: 36,
                    height: 36,
                    child: PopupMenuButton<String>(
                      tooltip: 'Sticker actions',
                      padding: EdgeInsets.zero,
                      iconSize: 20,
                      onSelected: (v) => widget.action(v, sticker),
                      itemBuilder: (_) => menu(),
                    ),
                  ),
                ),
              Positioned(
                bottom: 8,
                left: 0,
                right: 0,
                child: IgnorePointer(
                  child: Center(
                    child: Tooltip(
                      message: '${sticker['reviewStatus'] ?? 'PENDING'}',
                      child: Icon(
                        switch (sticker['reviewStatus']) {
                          'APPROVED' => Icons.check_circle_outline,
                          'NEEDS_WORK' => Icons.error_outline,
                          _ => Icons.pending_outlined,
                        },
                        size: 14,
                        semanticLabel:
                            '${sticker['reviewStatus'] ?? 'PENDING'}',
                      ),
                    ),
                  ),
                ),
              ),
              if (widget.editable)
                Positioned(
                  bottom: 0,
                  left: 0,
                  child: SizedBox(
                    width: 36,
                    height: 36,
                    child: Checkbox(
                      semanticLabel: 'Select sticker ${index + 1}',
                      value: selected,
                      onChanged: (_) => widget.select(
                        id,
                        HardwareKeyboard.instance.isShiftPressed,
                      ),
                    ),
                  ),
                ),
              if (widget.editable)
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Draggable<String>(
                    data: id,
                    feedback: feedback(sticker),
                    onDragUpdate: dragUpdate,
                    onDragEnd: (_) => stopScroll(),
                    onDraggableCanceled: (_, _) => stopScroll(),
                    child: Semantics(
                      label: 'Drag sticker ${index + 1} to reorder',
                      child: Tooltip(
                        excludeFromSemantics: true,
                        message: 'Drag sticker ${index + 1} to reorder',
                        child: const SizedBox(
                          width: 36,
                          height: 36,
                          child: Icon(Icons.drag_indicator, size: 20),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (_, bounds) {
      columns = bounds.maxWidth < 600
          ? 3
          : (bounds.maxWidth / 160).floor().clamp(3, 8);
      tileSize = (bounds.maxWidth - 32 - (columns - 1) * 10) / columns;
      headerExtent = widget.tray == null ? 0 : tileSize + 70;
      return CustomScrollView(
        key: viewport,
        controller: scroll,
        slivers: [
          if (widget.tray != null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Column(
                  children: [
                    Center(
                      child: SizedBox(
                        width: tileSize,
                        height: tileSize,
                        child: OutlinedButton(
                          onPressed: widget.changeTray,
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.all(16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: Tooltip(
                            message: widget.changeTray == null
                                ? 'Tray icon'
                                : 'Change tray icon',
                            child: widget.tray!,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text('Tray icon', style: TextStyle(fontSize: 12)),
                    if (widget.showSlots)
                      const Text(
                        'Hold and drag a sticker to reorder',
                        style: TextStyle(fontSize: 12),
                      ),
                  ],
                ),
              ),
            ),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverGrid(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: columns,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, index) => index < widget.stickers.length
                    ? stickerTile(context, index)
                    : slot(context, index),
                childCount: widget.showSlots ? 30 : widget.stickers.length,
              ),
            ),
          ),
          if (widget.stickers.isEmpty && !widget.showSlots)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: Text('No stickers yet')),
            ),
        ],
      );
    },
  );
}

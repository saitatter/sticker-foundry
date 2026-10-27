import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';

class StickerGrid extends StatefulWidget {
  final List<Json> stickers;
  final Set<String> selected;
  final bool editable, public;
  final String? focusId;
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
  });
  @override
  State<StickerGrid> createState() => _StickerGridState();
}

class _StickerGridState extends State<StickerGrid> {
  final scroll = ScrollController();
  final keys = <String, GlobalKey>{};
  int columns = 1;
  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant StickerGrid old) {
    super.didUpdateWidget(old);
    if (old.focusId != widget.focusId && widget.focusId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted || !scroll.hasClients) return;
        final index = widget.stickers.indexWhere(
          (s) => s['id'] == widget.focusId,
        );
        if (index < 0) return;
        final context = keys[widget.focusId]?.currentContext;
        if (context != null) {
          Scrollable.ensureVisible(
            context,
            duration: const Duration(milliseconds: 150),
            alignment: .5,
          );
        } else {
          scroll.animateTo(
            ((index ~/ columns) * 198.0).clamp(
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

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (_, bounds) {
      columns = ((bounds.maxWidth - 22) / 190).ceil().clamp(1, 30);
      return GridView.builder(
        controller: scroll,
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 180,
          mainAxisExtent: 188,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
        ),
        itemCount: widget.stickers.length,
        itemBuilder: (context, index) {
          final sticker = widget.stickers[index], id = sticker['id'] as String;
          final selected = widget.selected.contains(id);
          return DragTarget<String>(
            key: keys.putIfAbsent(id, () => GlobalKey()),
            onWillAcceptWithDetails: (d) =>
                widget.editable &&
                d.data != id &&
                widget.stickers.any((s) => s['id'] == d.data),
            onAcceptWithDetails: (d) => widget.drop(d.data, id),
            builder: (context, candidates, _) => Card(
              key: ValueKey('sticker-$id'),
              color: selected || candidates.isNotEmpty
                  ? Theme.of(context).colorScheme.secondaryContainer
                  : null,
              child: Stack(
                children: [
                  Column(
                    children: [
                      Expanded(
                        child: InkWell(
                          onTap: () {
                            if (widget.editable &&
                                (widget.selected.isNotEmpty ||
                                    HardwareKeyboard
                                        .instance
                                        .isControlPressed ||
                                    HardwareKeyboard.instance.isMetaPressed ||
                                    HardwareKeyboard.instance.isShiftPressed)) {
                              widget.select(
                                id,
                                HardwareKeyboard.instance.isShiftPressed,
                              );
                            } else {
                              widget.open(sticker);
                            }
                          },
                          onLongPress: widget.editable
                              ? () => widget.select(id, false)
                              : null,
                          child: Padding(
                            padding: const EdgeInsets.all(8),
                            child: widget.image(sticker),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(left: 10),
                              child: Text(
                                (sticker['emojis'] as List? ?? []).join(' '),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                          Tooltip(
                            message: '${sticker['reviewStatus'] ?? 'PENDING'}',
                            child: Icon(
                              switch (sticker['reviewStatus']) {
                                'APPROVED' => Icons.check_circle_outline,
                                'NEEDS_WORK' => Icons.error_outline,
                                _ => Icons.pending_outlined,
                              },
                              size: 16,
                              semanticLabel:
                                  '${sticker['reviewStatus'] ?? 'PENDING'}',
                            ),
                          ),
                          if (!widget.public)
                            PopupMenuButton<String>(
                              tooltip: 'Sticker actions',
                              onSelected: (v) => widget.action(v, sticker),
                              itemBuilder: (_) => [
                                if (widget.editable) ...[
                                  const PopupMenuItem(
                                    value: 'edit',
                                    child: Text('Edit image'),
                                  ),
                                  const PopupMenuItem(
                                    value: 'replace',
                                    child: Text('Replace image'),
                                  ),
                                  const PopupMenuItem(
                                    value: 'details',
                                    child: Text('Emoji, description & review'),
                                  ),
                                  const PopupMenuItem(
                                    value: 'select',
                                    child: Text('Select'),
                                  ),
                                  const PopupMenuItem(
                                    value: 'up',
                                    child: Text('Move earlier'),
                                  ),
                                  const PopupMenuItem(
                                    value: 'down',
                                    child: Text('Move later'),
                                  ),
                                  const PopupMenuItem(
                                    value: 'delete',
                                    child: Text('Delete'),
                                  ),
                                ],
                                const PopupMenuItem(
                                  value: 'comments',
                                  child: Text('Comments'),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ],
                  ),
                  if (widget.editable)
                    Positioned(
                      top: 0,
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
                      top: 0,
                      right: 0,
                      child: Draggable<String>(
                        data: id,
                        feedback: Material(
                          elevation: 8,
                          borderRadius: BorderRadius.circular(12),
                          child: SizedBox(
                            width: 110,
                            height: 110,
                            child: widget.image(sticker),
                          ),
                        ),
                        childWhenDragging: const Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(Icons.drag_indicator, color: Colors.grey),
                        ),
                        child: Tooltip(
                          message: 'Drag sticker ${index + 1} to reorder',
                          child: const Padding(
                            padding: EdgeInsets.all(8),
                            child: Icon(Icons.drag_indicator, size: 20),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}

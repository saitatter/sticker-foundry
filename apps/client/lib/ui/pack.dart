import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../core/native_bridge.dart';
import '../editor/image_editor.dart';
import '../editor/editor_renderer.dart';
import 'common.dart';
import 'sticker_grid.dart';
import 'pack_settings.dart';
import 'activity_panel.dart';

class PackScreen extends StatefulWidget {
  final FoundryStore store;
  final String id;
  final bool public;
  final String section;
  const PackScreen({
    super.key,
    required this.store,
    required this.id,
    this.public = false,
    this.section = 'stickers',
  });
  @override
  State<PackScreen> createState() => _PackScreenState();
}

class _PackScreenState extends State<PackScreen> {
  FoundryStore get s => widget.store;
  String get base => 'packs/${widget.id}';
  Json? pack;
  Future<dynamic>? latestActivity;
  String? failure;
  int tab = 0;
  final selected = <String>{};
  String? selectionAnchor;
  final keyboardFocus = FocusNode(debugLabel: 'Pack shortcuts');
  @override
  void dispose() {
    keyboardFocus.dispose();
    super.dispose();
  }

  void readSection() {
    tab = switch (widget.section) {
      'collaboration' => 1,
      'activity' => 2,
      'settings' => 3,
      'overview' => 4,
      _ => 0,
    };
  }

  bool get edit => !widget.public && pack?['canEdit'] == true && !s.offline;
  bool get manage => !widget.public && pack?['canManage'] == true && !s.offline;
  @override
  void initState() {
    super.initState();
    readSection();
    load();
  }

  Future<void> load() async {
    try {
      final value = widget.public
          ? object(await s.api.request('public/$base', auth: false))
          : await s.pack(widget.id);
      if (mounted) {
        setState(() {
          pack = value;
          latestActivity = null;
          failure = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => failure = userMessage(e));
    }
  }

  @override
  void didUpdateWidget(covariant PackScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id ||
        oldWidget.public != widget.public ||
        oldWidget.section != widget.section) {
      pack = null;
      failure = null;
      selected.clear();
      readSection();
      load();
    }
  }

  Future<void> mutate(String path, {String method = 'POST', Json? data}) =>
      s.run(() async {
        await s.api.request(path, method: method, data: data);
        await load();
        await s.afterPackMutation(widget.id);
      });
  Future<void> upload({String? replace, bool tray = false}) async {
    final files = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'],
    );
    EditorRecipe? sharedRecipe;
    for (final file in (replace != null || tray ? files.take(1) : files)) {
      if (!mounted) return;
      if (!tray && replace == null && objects(pack!['stickers']).length >= 30) {
        s.error = 'A pack can contain at most 30 stickers.';
        s.changed();
        return;
      }
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      final isAnimated = pack?['isAnimated'] == true && !tray;
      EditedMedia? media;
      if (sharedRecipe != null) {
        await s.run(() async {
          media = await renderEditedMedia(
            bytes,
            file.name,
            sharedRecipe!,
            animated: isAnimated,
          );
        });
        if (s.error != null) break;
      } else {
        media = await editMedia(
          context,
          bytes,
          file.name,
          animated: isAnimated,
          tray: tray,
          allowBatch: files.length > 1 && replace == null && !tray,
        );
        if (media?.applyToAll == true) sharedRecipe = media!.recipe;
      }
      if (media == null) continue;
      await s.run(() async {
        await s.upload(
          widget.id,
          media!.bytes,
          media!.name,
          media!.options,
          replace: replace,
          tray: tray,
        );
        await load();
      });
      if (s.error != null) break;
    }
  }

  Future<void> editImage(Json sticker) async {
    await s.run(() async {
      final bytes = await s.sticker(pack!, sticker);
      if (bytes == null || !mounted) return;
      final media = await editMedia(
        context,
        bytes,
        sticker['fileName'],
        animated: pack?['isAnimated'] == true,
        initial: EditorRecipe(
          document: EditDocument(),
          emojis: (sticker['emojis'] as List? ?? []).join(', '),
          accessibilityText: '${sticker['accessibilityText'] ?? ''}',
          includeEmptyMetadata: true,
        ),
      );
      if (media != null) {
        await s.upload(
          widget.id,
          media.bytes,
          media.name,
          media.options,
          replace: sticker['id'],
        );
        await load();
      }
    });
  }

  void settings() => context.go('/app/packs/${widget.id}/settings');
  void selectSticker(String id, bool range) {
    final ids = objects(pack!['stickers'])
        .map((s) => s['id'] as String)
        .toList();
    setState(() {
      if (range && selectionAnchor != null && ids.contains(selectionAnchor)) {
        final a = ids.indexOf(selectionAnchor!), b = ids.indexOf(id);
        selected.addAll(ids.sublist(a < b ? a : b, (a > b ? a : b) + 1));
      } else {
        if (!selected.add(id)) selected.remove(id);
        selectionAnchor = id;
      }
    });
  }

  Future<void> bulkUpdate(
    Json Function(Json) data, {
    String success = 'Selected stickers updated',
  }) async {
    final ids = Set<String>.from(selected);
    await s.run(() async {
      for (final sticker in objects(
        pack!['stickers'],
      ).where((sticker) => ids.contains(sticker['id']))) {
        await s.api.request(
          '$base/stickers/${sticker['id']}',
          method: 'PATCH',
          data: data(sticker),
        );
      }
      await load();
      await s.afterPackMutation(widget.id);
    }, success: success);
    if (mounted && !isTextEditingFocused()) keyboardFocus.requestFocus();
  }

  Future<void> bulkAction(String value) async {
    if (value == 'select-all') {
      setState(
        () => selected.addAll(
          objects(pack!['stickers']).map((v) => v['id'] as String),
        ),
      );
      return;
    }
    if (value == 'emoji') {
      final data = await formDialog(
        context,
        'Apply emoji to selected stickers',
        {'emojis': 'Emoji (comma separated)'},
      );
      if (data != null) {
        final emojis = (data['emojis'] as String)
            .split(',')
            .map((s) => s.trim())
            .where((s) => s.isNotEmpty)
            .take(3)
            .toList();
        await bulkUpdate((_) => {'emojis': emojis});
      }
    } else if (value == 'alt') {
      final stickers = objects(pack!['stickers']);
      await bulkUpdate(
        (sticker) => {
          'accessibilityText': String.fromCharCodes(
            '${pack!['name']} sticker ${stickers.indexWhere((s) => s['id'] == sticker['id']) + 1} ${(sticker['emojis'] as List? ?? []).join(' ')}'
                .runes
                .take(125),
          ),
        },
      );
    } else {
      await bulkUpdate((_) => {'reviewStatus': value});
    }
  }

  Future<void> dropSticker(List<String> ids) async {
    if (!edit || s.busy) return;
    await mutate('$base/stickers', method: 'PATCH', data: {'stickerIds': ids});
  }

  Future<void> deleteSelected() async {
    final ids = selected.toList();
    if (ids.isEmpty ||
        !await confirm(context, 'Delete ${ids.length} stickers?')) {
      return;
    }
    await s.run(() async {
      for (final id in ids) {
        await s.api.request('$base/stickers/$id', method: 'DELETE');
      }
      selected.clear();
      await load();
      await s.afterPackMutation(widget.id);
    });
  }

  KeyEventResult keyboard(FocusNode _, KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent ||
        !edit ||
        tab != 0 ||
        isTextEditingFocused()) {
      return KeyEventResult.ignored;
    }
    final key = event.logicalKey,
        modifier =
            HardwareKeyboard.instance.isControlPressed ||
            HardwareKeyboard.instance.isMetaPressed;
    if (key == LogicalKeyboardKey.escape) {
      setState(() {
        selected.clear();
        selectionAnchor = null;
      });
      return KeyEventResult.handled;
    }
    if (s.busy) return KeyEventResult.ignored;
    if (modifier && key == LogicalKeyboardKey.keyA) {
      bulkAction('select-all');
      return KeyEventResult.handled;
    }
    final ids = objects(pack!['stickers'])
        .map((s) => s['id'] as String)
        .toList();
    if (ids.isEmpty) return KeyEventResult.ignored;
    if (key == LogicalKeyboardKey.keyJ || key == LogicalKeyboardKey.keyK) {
      final delta = key == LogicalKeyboardKey.keyJ ? 1 : -1;
      final start = selectionAnchor == null
          ? (delta > 0 ? -1 : ids.length)
          : ids.indexOf(selectionAnchor!);
      final index = (start + delta).clamp(0, ids.length - 1);
      setState(() {
        selected
          ..clear()
          ..add(ids[index]);
        selectionAnchor = ids[index];
      });
      return KeyEventResult.handled;
    }
    if (event is KeyRepeatEvent) return KeyEventResult.ignored;
    if (selected.isEmpty) return KeyEventResult.ignored;
    final status = {
      LogicalKeyboardKey.keyA: 'APPROVED',
      LogicalKeyboardKey.keyP: 'PENDING',
      LogicalKeyboardKey.keyN: 'NEEDS_WORK',
    }[key];
    if (status != null && !modifier) {
      bulkAction(status);
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.delete) {
      deleteSelected();
      return KeyEventResult.handled;
    }
    if (HardwareKeyboard.instance.isShiftPressed &&
        selected.length == 1 &&
        [
          LogicalKeyboardKey.arrowUp,
          LogicalKeyboardKey.arrowDown,
        ].contains(key)) {
      reorder(selected.single, key == LogicalKeyboardKey.arrowUp ? -1 : 1);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Future<void> stickerAction(String value, Json sticker) async {
    final id = sticker['id'] as String;
    switch (value) {
      case 'select':
        selectSticker(id, false);
      case 'edit':
        await editImage(sticker);
      case 'replace':
        await upload(replace: id);
      case 'details':
        await metadata(sticker);
      case 'comments':
        comments(sticker);
      case 'up':
        await reorder(id, -1);
      case 'down':
        await reorder(id, 1);
      case 'delete':
        if (await confirm(context, 'Delete this sticker?')) {
          await mutate('$base/stickers/$id', method: 'DELETE');
        }
    }
  }

  void openSticker(Json sticker) {
    if (edit) {
      editImage(sticker);
      return;
    }
    if (!widget.public) {
      comments(sticker);
      return;
    }
    showDialog(
      context: context,
      builder: (c) => Dialog(
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(32),
              child: InteractiveViewer(
                child: StickerImage(
                  store: s,
                  pack: pack!,
                  sticker: sticker,
                  public: true,
                ),
              ),
            ),
            Positioned(
              top: 0,
              right: 0,
              child: action(
                Icons.close,
                'Close preview',
                () => Navigator.pop(c),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> export({bool share = false}) => s.run(() async {
    final bytes = widget.public
        ? await s.api.request('public/$base/export', auth: false, raw: true)
              as Uint8List
        : await s.export(widget.id);
    await download(bytes, '${pack!['name']}.zip', share: share);
  });
  Future<void> moveOrCopy(bool move) async {
    final targets = s.packs
        .where(
          (p) =>
              p['id'] != widget.id &&
              p['canEdit'] == true &&
              p['isAnimated'] == pack!['isAnimated'],
        )
        .toList();
    if (targets.isEmpty) {
      s.error = 'Create another compatible pack first.';
      s.changed();
      return;
    }
    final target = await showDialog<String>(
      context: context,
      builder: (c) => SimpleDialog(
        title: Text(move ? 'Move stickers to' : 'Copy stickers to'),
        children: targets
            .map(
              (p) => SimpleDialogOption(
                onPressed: () => Navigator.pop(c, p['id']),
                child: Text(p['name']),
              ),
            )
            .toList(),
      ),
    );
    if (target != null) {
      await mutate(
        '$base/stickers/${move ? 'move' : 'copy'}',
        data: {'targetPackId': target, 'stickerIds': selected.toList()},
      );
      if (s.error == null) {
        await s.afterPackMutation(target);
      }
      if (mounted) setState(selected.clear);
    }
  }

  Future<void> metadata(Json sticker) async {
    final d = await formDialog(
      context,
      'Sticker details',
      {
        'emojis': 'Emoji (separate with commas)',
        'accessibilityText': 'Accessibility description',
      },
      values: {
        ...sticker,
        'emojis': (sticker['emojis'] as List? ?? []).join(','),
      },
      choices: {
        'reviewStatus': ['PENDING', 'APPROVED', 'NEEDS_WORK'],
      },
      optional: {'emojis', 'accessibilityText'},
    );
    if (d != null) {
      d['emojis'] = (d['emojis'] as String)
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
      await mutate('$base/stickers/${sticker['id']}', method: 'PATCH', data: d);
    }
  }

  void comments(Json sticker) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (c) => SizedBox(
        height: MediaQuery.sizeOf(c).height * .8,
        child: CommentPanel(
          manage: manage,
          store: s,
          path: '$base/stickers/${sticker['id']}/comments',
        ),
      ),
    );
  }

  Future<void> reorder(String id, int delta) async {
    final ids = objects(pack!['stickers'])
        .map((e) => e['id'] as String)
        .toList();
    final index = ids.indexOf(id), target = index + delta;
    if (target < 0 || target >= ids.length) return;
    ids.removeAt(index);
    ids.insert(target, id);
    await mutate('$base/stickers', method: 'PATCH', data: {'stickerIds': ids});
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !widget.public,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop && widget.public) context.go('/discover');
    },
    child: Focus(
      focusNode: keyboardFocus,
      autofocus: true,
      onKeyEvent: keyboard,
      child: ListenableBuilder(
        listenable: s,
        builder: (_, _) => content(context),
      ),
    ),
  );
  Widget content(BuildContext context) {
    if (pack == null) {
      return Scaffold(
        appBar: AppBar(
          leading: widget.public
              ? BackButton(onPressed: () => context.go('/discover'))
              : null,
          title: const Text('Pack'),
        ),
        body: Center(
          child: failure == null
              ? const CircularProgressIndicator()
              : requestFailure(failure, load),
        ),
      );
    }
    final stickers = objects(pack!['stickers'])
        .where(
          (sticker) =>
              !widget.public ||
              pack!['requiresApproval'] != true ||
              sticker['reviewStatus'] == 'APPROVED',
        )
        .toList();
    final visibleJobs = s.jobs
        .where(
          (job) => job['packId'] == widget.id && job['status'] != 'COMPLETED',
        )
        .toList();
    return Scaffold(
      appBar: AppBar(
        leading: widget.public
            ? BackButton(onPressed: () => context.go('/discover'))
            : null,
        title: Text('${pack!['name']}'),
        actions: [
          if (edit)
            action(
              Icons.add_photo_alternate_outlined,
              'Add stickers',
              s.busy ? null : upload,
            ),
          PopupMenuButton<String>(
            enabled: !s.busy,
            tooltip: 'Pack actions',
            onSelected: (v) async {
              switch (v) {
                case 'settings':
                  settings();
                case 'tray':
                  await upload(tray: true);
                case 'manifest':
                  await s.run(() async {
                    final value = await s.api.request('$base/contents');
                    if (context.mounted) {
                      await showDialog(
                        context: context,
                        builder: (c) => AlertDialog(
                          title: const Text('Export manifest'),
                          content: SingleChildScrollView(
                            child: SelectionArea(
                              child: Text(
                                const JsonEncoder.withIndent('  ')
                                    .convert(value),
                              ),
                            ),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(c),
                              child: const Text('Close'),
                            ),
                          ],
                        ),
                      );
                    }
                  });
                case 'export':
                  await export();
                case 'share':
                  await export(share: true);
                case 'link':
                  await SharePlus.instance.share(
                    ShareParams(
                      text:
                          '${Uri.parse(s.api.baseUrl).resolve('/').toString()}share/${widget.id}',
                    ),
                  );
                case 'sync':
                  await s.run(() => s.sync(id: widget.id));
                case 'whatsapp':
                case 'business':
                  await s.run(() async {
                    if (!s.offline) await s.sync(id: widget.id);
                    s.notice = await NativeBridge.importPack(
                      widget.id,
                      business: v == 'business',
                    );
                  });
                case 'clone':
                  await s.run(() async {
                    final p = object(
                      await s.api.request(
                        '$base/clone',
                        method: 'POST',
                        data: {},
                      ),
                    );
                    await s.refresh();
                    if (context.mounted) {
                      context.go('/app/packs/${p['id']}/stickers');
                    }
                  });
                case 'delete':
                  if (await confirm(
                    context,
                    'Delete this pack and all its stickers?',
                  )) {
                    await s.run(() async {
                      await s.api.request(base, method: 'DELETE');
                      await s.sync();
                      if (context.mounted) context.go('/');
                    });
                  }
              }
            },
            itemBuilder: (_) => [
              if (!widget.public && pack!['canExport'] == true)
                const PopupMenuItem(
                  value: 'manifest',
                  child: Text('Preview export manifest'),
                ),
              if (manage)
                const PopupMenuItem(
                  value: 'settings',
                  child: Text('Pack settings'),
                ),
              if (edit)
                const PopupMenuItem(
                  value: 'tray',
                  child: Text('Change tray icon'),
                ),
              if (pack!['canExport'] == true)
                const PopupMenuItem(value: 'export', child: Text('Export ZIP')),
              if (pack!['canExport'] == true)
                const PopupMenuItem(value: 'share', child: Text('Share ZIP')),
              if (pack!['isPublic'] == true)
                const PopupMenuItem(
                  value: 'link',
                  child: Text('Share public link'),
                ),
              if (!widget.public && pack!['canExport'] == true)
                const PopupMenuItem(
                  value: 'sync',
                  child: Text('Download for offline use'),
                ),
              if (!widget.public &&
                  NativeBridge.android &&
                  pack!['canExport'] == true)
                const PopupMenuItem(
                  value: 'whatsapp',
                  child: Text('Add to WhatsApp'),
                ),
              if (!widget.public &&
                  NativeBridge.android &&
                  pack!['canExport'] == true)
                const PopupMenuItem(
                  value: 'business',
                  child: Text('Add to WhatsApp Business'),
                ),
              if (s.user != null && !s.offline)
                const PopupMenuItem(value: 'clone', child: Text('Clone pack')),
              if (manage)
                const PopupMenuItem(
                  value: 'delete',
                  child: Text('Delete pack'),
                ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          messages(s),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${pack!['publisher']} · ${stickers.length}/30 stickers${pack!['isAnimated'] == true ? ' · Animated' : ''}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                if (pack!['description'] != null)
                  Tooltip(
                    message: pack!['description'],
                    child: const Icon(Icons.info_outline, size: 20),
                  ),
              ],
            ),
          ),
          if (!widget.public)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SegmentedButton<int>(
                segments: [
                  ButtonSegment(
                    value: 0,
                    icon: Icon(Icons.grid_view),
                    label: MediaQuery.sizeOf(context).width >= 600
                        ? const Text('Stickers')
                        : null,
                    tooltip: MediaQuery.sizeOf(context).width < 600
                        ? 'Stickers'
                        : null,
                  ),
                  ButtonSegment(
                    value: 1,
                    icon: Icon(Icons.group_outlined),
                    label: MediaQuery.sizeOf(context).width >= 600
                        ? const Text('People')
                        : null,
                    tooltip: MediaQuery.sizeOf(context).width < 600
                        ? 'People'
                        : null,
                  ),
                  ButtonSegment(
                    value: 2,
                    icon: Icon(Icons.history),
                    label: MediaQuery.sizeOf(context).width >= 600
                        ? const Text('Activity')
                        : null,
                    tooltip: MediaQuery.sizeOf(context).width < 600
                        ? 'Activity'
                        : null,
                  ),
                  ButtonSegment(
                    value: 4,
                    icon: const Icon(Icons.dashboard_outlined),
                    label: MediaQuery.sizeOf(context).width >= 600
                        ? const Text('Overview')
                        : null,
                    tooltip: MediaQuery.sizeOf(context).width < 600
                        ? 'Overview'
                        : null,
                  ),
                  if (manage || tab == 3)
                    ButtonSegment(
                      value: 3,
                      icon: Icon(Icons.settings_outlined),
                      label: MediaQuery.sizeOf(context).width >= 600
                          ? const Text('Settings')
                          : null,
                      tooltip: MediaQuery.sizeOf(context).width < 600
                          ? 'Settings'
                          : null,
                    ),
                ],
                selected: {tab},
                onSelectionChanged: (v) => context.go(
                  '/app/packs/${widget.id}/${['stickers', 'collaboration', 'activity', 'settings', 'overview'][v.first]}',
                ),
              ),
            ),
          if (selected.isNotEmpty)
            Row(
              children: [
                action(
                  Icons.close,
                  'Clear selection',
                  () => setState(selected.clear),
                ),
                Text('${selected.length} selected'),
                const Spacer(),
                action(Icons.copy, 'Copy', () => moveOrCopy(false)),
                action(
                  Icons.drive_file_move_outline,
                  'Move',
                  () => moveOrCopy(true),
                ),
                PopupMenuButton<String>(
                  tooltip: 'Bulk actions',
                  onSelected: bulkAction,
                  itemBuilder: (_) => [
                    const PopupMenuItem(
                      value: 'APPROVED',
                      child: Text('Approve selected'),
                    ),
                    const PopupMenuItem(
                      value: 'PENDING',
                      child: Text('Mark pending'),
                    ),
                    const PopupMenuItem(
                      value: 'NEEDS_WORK',
                      child: Text('Mark needs work'),
                    ),
                    const PopupMenuItem(
                      value: 'emoji',
                      child: Text('Apply emoji'),
                    ),
                    const PopupMenuItem(
                      value: 'alt',
                      child: Text('Generate descriptions'),
                    ),
                    const PopupMenuItem(
                      value: 'select-all',
                      child: Text('Select all'),
                    ),
                  ],
                ),
                action(Icons.delete_outline, 'Delete selected', deleteSelected),
              ],
            ),
          Expanded(
            child: tab == 4
                ? overview()
                : tab == 3
                ? (manage
                      ? PackSettingsPanel(store: s, pack: pack!, reload: load)
                      : const Center(
                          child: Text('Pack owner permission required'),
                        ))
                : tab == 1
                ? people()
                : tab == 2
                ? activity()
                : StickerGrid(
                    stickers: stickers,
                    selected: Set.unmodifiable(selected),
                    editable: edit && !s.busy,
                    public: widget.public,
                    showSlots: edit,
                    add: edit && !s.busy ? upload : null,
                    changeTray: edit && !s.busy
                        ? () => upload(tray: true)
                        : null,
                    tray: FutureBuilder<Uint8List?>(
                      future: s.cover(pack!, public: widget.public),
                      builder: (_, snap) => snap.hasData
                          ? Image.memory(
                              snap.data!,
                              fit: BoxFit.contain,
                              errorBuilder: (_, _, _) => const Icon(
                                Icons.broken_image_outlined,
                                size: 32,
                              ),
                            )
                          : const Icon(
                              Icons.add_photo_alternate_outlined,
                              size: 32,
                            ),
                    ),
                    focusId: selectionAnchor,
                    image: (sticker) => StickerImage(
                      store: s,
                      pack: pack!,
                      sticker: sticker,
                      public: widget.public,
                    ),
                    open: openSticker,
                    select: selectSticker,
                    drop: dropSticker,
                    action: stickerAction,
                  ),
          ),
          if (!widget.public && visibleJobs.isNotEmpty)
            SizedBox(
              height: 64,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: visibleJobs
                    .map(
                      (j) => Padding(
                        padding: const EdgeInsets.all(8),
                        child: Row(
                          children: [
                            Text(
                              '${fieldLabel('${j['label'] ?? j['type'] ?? 'Processing'}')}: ${fieldLabel('${j['status']}')} ${j['progress'] ?? 0}%',
                            ),
                            if (['QUEUED', 'PROCESSING'].contains(j['status']))
                              action(
                                Icons.cancel_outlined,
                                'Cancel job',
                                () => s.run(() async {
                                  await s.api.request(
                                    'jobs/${j['id']}/cancel',
                                    method: 'POST',
                                  );
                                }),
                              ),
                            if (['FAILED', 'CANCELLED'].contains(j['status']))
                              action(
                                Icons.refresh,
                                'Retry job',
                                () => s.run(() async {
                                  await s.track(
                                    object(
                                      await s.api.request(
                                        'jobs/${j['id']}/retry',
                                        method: 'POST',
                                      ),
                                    ),
                                    widget.id,
                                  );
                                  await load();
                                }),
                              ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }

  Widget people() => !manage
      ? const Center(child: Text('The pack owner manages members and invites.'))
      : DefaultTabController(
          length: 2,
          child: Column(
            children: [
              const TabBar(
                tabs: [
                  Tab(text: 'Members'),
                  Tab(text: 'Invites'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    RemoteList(
                      store: s,
                      path: '$base/members',
                      item: (row, reload) => ListTile(
                        title: Text('${object(row['user'])['displayName']}'),
                        subtitle: Text(
                          '${object(row['user'])['email']} · ${row['role']}',
                        ),
                        trailing: manage && row['role'] != 'OWNER'
                            ? PopupMenuButton<String>(
                                onSelected: (v) async {
                                  await mutate(
                                    '$base/members/${row['id']}',
                                    method: v == 'REMOVE' ? 'DELETE' : 'PATCH',
                                    data: v == 'REMOVE' ? null : {'role': v},
                                  );
                                  reload();
                                },
                                itemBuilder: (_) =>
                                    ['EDITOR', 'VIEWER', 'REMOVE']
                                        .map(
                                          (v) => PopupMenuItem(
                                            value: v,
                                            child: Text(v),
                                          ),
                                        )
                                        .toList(),
                              )
                            : null,
                      ),
                    ),
                    RemoteList(
                      store: s,
                      path: '$base/invites',
                      actions: [
                        if (manage)
                          TextButton.icon(
                            icon: const Icon(Icons.person_add_alt),
                            label: const Text('Invite'),
                            onPressed: () async {
                              final d = await formDialog(
                                context,
                                'Create invite',
                                {
                                  'email': 'Email (optional)',
                                  'expiresAt': 'Expiry ISO date (optional)',
                                },
                                optional: {'email', 'expiresAt'},
                                choices: {
                                  'role': ['EDITOR', 'VIEWER'],
                                },
                              );
                              if (d != null) {
                                d.removeWhere((k, v) => v == '');
                                await mutate('$base/invites', data: d);
                                if (mounted) setState(() {});
                              }
                            },
                          ),
                      ],
                      item: (row, reload) => ListTile(
                        title: Row(
                          children: [
                            Expanded(child: SelectableText('${row['code']}')),
                            action(Icons.copy, 'Copy invite code', () async {
                              await Clipboard.setData(
                                ClipboardData(text: '${row['code']}'),
                              );
                              s.notice = 'Invite code copied';
                              s.changed();
                            }),
                          ],
                        ),
                        subtitle: Text(
                          '${row['email'] ?? 'Anyone with this code'} · ${row['role']} · ${row['acceptedAt'] != null ? 'Accepted' : row['expiresAt'] ?? 'No expiry'}',
                        ),
                        trailing: manage
                            ? action(Icons.close, 'Revoke', () async {
                                await mutate(
                                  '$base/invites/${row['id']}',
                                  method: 'DELETE',
                                );
                                reload();
                              })
                            : null,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
  Widget overview() {
    final rows = objects(pack!['stickers']);
    if (!widget.public && !s.offline) {
      latestActivity ??= s.api.request('$base/activity?limit=1');
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: SizedBox(
            width: 64,
            height: 64,
            child: FutureBuilder<Uint8List?>(
              future: s.cover(pack!, public: widget.public),
              builder: (_, snap) => snap.hasData
                  ? Image.memory(snap.data!)
                  : const Icon(Icons.collections_outlined),
            ),
          ),
          title: Text('${pack!['name']}'),
          subtitle: Text(
            '${pack!['publisher']} · ${fieldLabel('${pack!['role'] ?? (manage
                    ? 'OWNER'
                    : edit
                    ? 'EDITOR'
                    : 'VIEWER')}')}',
          ),
        ),
        if ('${pack!['description'] ?? ''}'.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text('${pack!['description']}'),
          ),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            Chip(label: Text('${rows.length}/30 stickers')),
            Chip(
              label: Text(
                '${rows.where((s) => s['reviewStatus'] == 'APPROVED').length} approved',
              ),
            ),
            Chip(
              label: Text(pack!['isAnimated'] == true ? 'Animated' : 'Static'),
            ),
            Chip(label: Text(pack!['isPublic'] == true ? 'Public' : 'Private')),
          ],
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(
            pack!['canExport'] == true
                ? Icons.check_circle_outline
                : Icons.info_outline,
          ),
          title: Text(
            pack!['canExport'] == true
                ? 'Ready to export'
                : 'Export needs at least 3 eligible stickers',
          ),
          subtitle: pack!['requiresApproval'] == true
              ? const Text('Only approved stickers are exported.')
              : null,
        ),
        if (latestActivity != null)
          FutureBuilder(
            future: latestActivity,
            builder: (_, snap) {
              if (!snap.hasData) return const SizedBox.shrink();
              final entries = objects(snap.data);
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.history),
                title: const Text('Latest activity'),
                subtitle: Text(
                  entries.isEmpty
                      ? 'No activity yet'
                      : '${entries.first['action']} · ${entries.first['createdAt']}',
                ),
                onTap: () => context.go('/app/packs/${widget.id}/activity'),
              );
            },
          ),
      ],
    );
  }

  Widget activity() =>
      ActivityPanel(store: s, packId: widget.id, manage: manage);
}

class StickerImage extends StatelessWidget {
  final FoundryStore store;
  final Json pack, sticker;
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

class CommentPanel extends StatelessWidget {
  final FoundryStore store;
  final String path;
  final bool manage;
  const CommentPanel({
    super.key,
    required this.store,
    required this.path,
    this.manage = false,
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Comments'),
      automaticallyImplyLeading: false,
    ),
    body: RemoteList(
      store: store,
      path: path,
      actions: [
        TextButton.icon(
          icon: const Icon(Icons.add_comment_outlined),
          label: const Text('Add comment'),
          onPressed: () async {
            final d = await formDialog(context, 'Comment', {'body': 'Comment'});
            if (d != null) {
              await store.run(
                () => store.api.request(path, method: 'POST', data: d),
              );
            }
          },
        ),
      ],
      item: (row, reload) => ListTile(
        title: Text('${object(row['user'])['displayName']}'),
        subtitle: Text('${row['body']}'),
        trailing: manage || row['userId'] == store.user?['id']
            ? action(
                Icons.delete_outline,
                'Delete comment',
                () => store.run(() async {
                  await store.api.request(
                    '$path/${row['id']}',
                    method: 'DELETE',
                  );
                  reload();
                }),
              )
            : null,
      ),
    ),
  );
}

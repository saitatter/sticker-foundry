import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../core/native_bridge.dart';
import '../editor/image_editor.dart';
import 'common.dart';

class PackScreen extends StatefulWidget {
  final FoundryStore store;
  final String id;
  final bool public;
  const PackScreen({
    super.key,
    required this.store,
    required this.id,
    this.public = false,
  });
  @override
  State<PackScreen> createState() => _PackScreenState();
}

class _PackScreenState extends State<PackScreen> {
  FoundryStore get s => widget.store;
  String get base => 'packs/${widget.id}';
  Json? pack;
  String? failure;
  int tab = 0;
  final selected = <String>{};
  bool get edit => !widget.public && pack?['canEdit'] == true && !s.offline;
  bool get manage => !widget.public && pack?['canManage'] == true && !s.offline;
  @override
  void initState() {
    super.initState();
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
          failure = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => failure = '$e');
    }
  }

  @override
  void didUpdateWidget(covariant PackScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id || oldWidget.public != widget.public) {
      pack = null;
      failure = null;
      selected.clear();
      tab = 0;
      load();
    }
  }

  Future<void> mutate(String path, {String method = 'POST', Json? data}) =>
      s.run(() async {
        await s.api.request(path, method: method, data: data);
        await load();
        await s.refresh();
      });
  Future<void> upload({String? replace, bool tray = false}) async {
    final files = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'],
    );
    for (final file in files) {
      if (!mounted) return;
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      final media = await editMedia(
        context,
        bytes,
        file.name,
        animated: pack?['isAnimated'] == true && !tray,
        tray: tray,
      );
      if (media == null) continue;
      await s.run(() async {
        await s.upload(
          widget.id,
          media.bytes,
          media.name,
          media.options,
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

  Future<void> settings() async {
    final d = await formDialog(
      context,
      'Pack settings',
      {'name': 'Name', 'publisher': 'Publisher', 'description': 'Description'},
      values: pack!,
      optional: {'description'},
      flags: ['isPublic', 'requiresApproval', 'isAnimated'],
    );
    if (d != null) await mutate(base, method: 'PATCH', data: d);
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
      setState(selected.clear);
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
  Widget build(BuildContext context) =>
      ListenableBuilder(listenable: s, builder: (_, _) => content(context));
  Widget content(BuildContext context) {
    if (pack == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Pack')),
        body: Center(
          child: failure == null
              ? const CircularProgressIndicator()
              : TextButton(onPressed: load, child: Text('Retry: $failure')),
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
    return Scaffold(
      appBar: AppBar(
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
                  await settings();
                case 'tray':
                  await upload(tray: true);
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
                    if (context.mounted) context.push('/packs/${p['id']}');
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
              if (edit)
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
                segments: const [
                  ButtonSegment(
                    value: 0,
                    icon: Icon(Icons.grid_view),
                    label: Text('Stickers'),
                  ),
                  ButtonSegment(
                    value: 1,
                    icon: Icon(Icons.group_outlined),
                    label: Text('People'),
                  ),
                  ButtonSegment(
                    value: 2,
                    icon: Icon(Icons.history),
                    label: Text('Activity'),
                  ),
                ],
                selected: {tab},
                onSelectionChanged: (v) => setState(() => tab = v.first),
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
                action(Icons.delete_outline, 'Delete selected', () async {
                  if (await confirm(
                    context,
                    'Delete ${selected.length} stickers?',
                  )) {
                    await s.run(() async {
                      for (final id in selected.toList()) {
                        await s.api.request(
                          '$base/stickers/$id',
                          method: 'DELETE',
                        );
                      }
                      selected.clear();
                      await load();
                      await s.refresh();
                    });
                  }
                }),
              ],
            ),
          Expanded(
            child: tab == 1
                ? people()
                : tab == 2
                ? activity()
                : stickers.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.add_photo_alternate_outlined,
                          size: 48,
                        ),
                        const SizedBox(height: 12),
                        const Text('Add your first stickers'),
                        if (edit)
                          FilledButton.tonal(
                            onPressed: upload,
                            child: const Text('Choose images'),
                          ),
                      ],
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 180,
                          mainAxisExtent: 188,
                          crossAxisSpacing: 10,
                          mainAxisSpacing: 10,
                        ),
                    itemCount: stickers.length,
                    itemBuilder: (_, i) {
                      final sticker = stickers[i], id = sticker['id'] as String;
                      return Card(
                        color: selected.contains(id)
                            ? Theme.of(context).colorScheme.secondaryContainer
                            : null,
                        child: Column(
                          children: [
                            Expanded(
                              child: InkWell(
                                onTap: () => edit
                                    ? editImage(sticker)
                                    : comments(sticker),
                                onLongPress: edit
                                    ? () => setState(
                                        () => selected.contains(id)
                                            ? selected.remove(id)
                                            : selected.add(id),
                                      )
                                    : null,
                                child: Padding(
                                  padding: const EdgeInsets.all(8),
                                  child: StickerImage(
                                    store: s,
                                    pack: pack!,
                                    sticker: sticker,
                                    public: widget.public,
                                  ),
                                ),
                              ),
                            ),
                            Row(
                              children: [
                                Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.only(left: 10),
                                    child: Text(
                                      (sticker['emojis'] as List? ?? []).join(
                                        ' ',
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ),
                                if (!widget.public)
                                  PopupMenuButton<String>(
                                    tooltip: 'Sticker actions',
                                    onSelected: (v) async {
                                      switch (v) {
                                        case 'select':
                                          setState(
                                            () => selected.contains(id)
                                                ? selected.remove(id)
                                                : selected.add(id),
                                          );
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
                                          if (await confirm(
                                            context,
                                            'Delete this sticker?',
                                          )) {
                                            await mutate(
                                              '$base/stickers/$id',
                                              method: 'DELETE',
                                            );
                                          }
                                      }
                                    },
                                    itemBuilder: (_) => [
                                      if (edit) ...[
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
                                          child: Text(
                                            'Emoji, description & review',
                                          ),
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
                      );
                    },
                  ),
          ),
          if (s.jobs.any((j) => j['packId'] == widget.id))
            SizedBox(
              height: 72,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: s.jobs
                    .where((j) => j['packId'] == widget.id)
                    .map(
                      (j) => Padding(
                        padding: const EdgeInsets.all(8),
                        child: Row(
                          children: [
                            Text(
                              '${j['type'] ?? 'Processing'}: ${j['status']}',
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
                        title: SelectableText('${row['code']}'),
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
  int activityLimit = 50;
  Widget activity() => RemoteList(
    key: ValueKey(activityLimit),
    store: s,
    path: '$base/activity?limit=$activityLimit',
    actions: [
      TextButton(
        onPressed: () => setState(() => activityLimit += 50),
        child: const Text('Load more'),
      ),
      if (manage)
        TextButton(
          onPressed: () async {
            if (await confirm(context, 'Clear activity history?')) {
              await mutate('$base/activity', method: 'DELETE');
              if (mounted) setState(() => activityLimit = 50);
            }
          },
          child: const Text('Clear history'),
        ),
    ],
    item: (row, reload) => ListTile(
      leading: const Icon(Icons.history),
      title: Text('${row['action'] ?? row['type']}'),
      subtitle: Text(
        '${row['createdAt']}\n${row['metadata'] ?? row['details'] ?? ''}',
      ),
      trailing: manage
          ? action(Icons.delete_outline, 'Delete entry', () async {
              await mutate('$base/activity/${row['id']}', method: 'DELETE');
              reload();
            })
          : null,
    ),
  );
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
  const CommentPanel({super.key, required this.store, required this.path});
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
        trailing: row['userId'] == store.user?['id']
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

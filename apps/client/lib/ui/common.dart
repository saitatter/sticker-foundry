import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/store.dart';

bool isTextEditingFocused() {
  final context = FocusManager.instance.primaryFocus?.context;
  return context?.widget is EditableText ||
      context?.findAncestorStateOfType<EditableTextState>() != null;
}

String fieldLabel(String key) =>
    const {
      'teamId': 'Team',
      'role': 'Role',
      'reviewStatus': 'Review status',
      'registrationMode': 'Registration policy',
      'isPublic': 'Public pack',
      'requiresApproval': 'Require approval before export',
      'isAnimated': 'Animated stickers',
      'PENDING': 'Pending review',
      'APPROVED': 'Approved',
      'NEEDS_WORK': 'Needs changes',
      'EDITOR': 'Editor',
      'VIEWER': 'Viewer',
      'OWNER': 'Owner',
    }[key] ??
    key;

Widget action(IconData icon, String label, VoidCallback? callback) =>
    IconButton(tooltip: label, onPressed: callback, icon: Icon(icon));
Future<bool> confirm(BuildContext context, String title) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    ) ??
    false;
Future<Json?> formDialog(
  BuildContext context,
  String title,
  Map<String, String> fields, {
  Json values = const {},
  Map<String, List<String>> choices = const {},
  Map<String, Map<String, String>> choiceLabels = const {},
  List<String> flags = const [],
  Set<String> secrets = const {},
  Set<String> optional = const {},
}) async {
  final inputs = <String, String>{
    for (final k in fields.keys) k: '${values[k] ?? ''}',
  };
  final selected = <String, String>{
    for (final e in choices.entries) e.key: '${values[e.key] ?? e.value.first}',
  };
  final toggles = <String, bool>{for (final f in flags) f: values[f] == true};
  final key = GlobalKey<FormState>();
  final result = await showDialog<Json>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, update) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 440,
          child: SingleChildScrollView(
            child: Form(
              key: key,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final e in fields.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: TextFormField(
                        initialValue: inputs[e.key],
                        onChanged: (value) => inputs[e.key] = value,
                        decoration: InputDecoration(labelText: e.value),
                        obscureText: secrets.contains(e.key),
                        maxLines: e.key == 'description' || e.key == 'body'
                            ? 3
                            : 1,
                        validator: (v) =>
                            !optional.contains(e.key) &&
                                (v?.trim().isEmpty ?? true)
                            ? 'Required'
                            : null,
                      ),
                    ),
                  for (final e in choices.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: DropdownButtonFormField<String>(
                        initialValue: selected[e.key],
                        decoration: InputDecoration(
                          labelText: fieldLabel(e.key),
                        ),
                        items: e.value
                            .map(
                              (v) => DropdownMenuItem(
                                value: v,
                                child: Text(
                                  v.isEmpty
                                      ? 'Personal / none'
                                      : choiceLabels[e.key]?[v] ??
                                            fieldLabel(v),
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (v) => selected[e.key] = v!,
                      ),
                    ),
                  for (final f in flags)
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(fieldLabel(f)),
                      value: toggles[f]!,
                      onChanged: (v) => update(() => toggles[f] = v),
                    ),
                ],
              ),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (key.currentState!.validate()) {
                Navigator.pop(c, <String, dynamic>{
                  ...inputs.map((k, v) => MapEntry(k, v.trim())),
                  ...selected,
                  ...toggles,
                });
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    ),
  );
  return result;
}

Widget messages(FoundryStore s) => Column(
  children: [
    if (s.offline)
      const ListTile(
        leading: Icon(Icons.cloud_off),
        title: Text('Offline · downloaded packs'),
      ),
    if (s.error != null || s.notice != null)
      MaterialBanner(
        content: Text(s.error ?? s.notice!),
        leading: Icon(
          s.error == null ? Icons.check_circle_outline : Icons.error_outline,
        ),
        actions: [
          TextButton(
            onPressed: () {
              s.error = null;
              s.notice = null;
              s.changed();
            },
            child: const Text('Dismiss'),
          ),
        ],
      ),
  ],
);
Future<void> download(
  Uint8List bytes,
  String name, {
  bool share = false,
}) async {
  if (share) {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile.fromData(bytes, mimeType: 'application/zip', name: name)],
        fileNameOverrides: [name],
      ),
    );
  } else {
    await FilePicker.saveFile(
      dialogTitle: 'Save export',
      fileName: name,
      bytes: bytes,
    );
  }
}

class RemoteList extends StatefulWidget {
  final FoundryStore store;
  final String path;
  final Widget Function(Json, VoidCallback) item;
  final List<Widget> actions;
  const RemoteList({
    super.key,
    required this.store,
    required this.path,
    required this.item,
    this.actions = const [],
  });
  @override
  State<RemoteList> createState() => _RemoteListState();
}

class _RemoteListState extends State<RemoteList> {
  late Future<dynamic> data;
  bool wasBusy = false;
  void onStoreChange() {
    final completed = wasBusy && !widget.store.busy;
    wasBusy = widget.store.busy;
    if (completed && mounted) reload();
  }

  @override
  void dispose() {
    widget.store.removeListener(onStoreChange);
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    widget.store.addListener(onStoreChange);
    reload();
  }

  void reload() {
    setState(() {
      data = widget.store.api.request(widget.path);
    });
  }

  @override
  void didUpdateWidget(covariant RemoteList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.store != widget.store) {
      oldWidget.store.removeListener(onStoreChange);
      widget.store.addListener(onStoreChange);
      wasBusy = widget.store.busy;
    }
    if (oldWidget.path != widget.path || oldWidget.store != widget.store) {
      reload();
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      if (widget.actions.isNotEmpty) Wrap(spacing: 8, children: widget.actions),
      Expanded(
        child: FutureBuilder(
          future: data,
          builder: (c, s) {
            if (s.hasError) {
              return Center(
                child: TextButton(
                  onPressed: reload,
                  child: Text('Retry: ${s.error}'),
                ),
              );
            }
            if (!s.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final value = s.data;
            final rows = value is List
                ? objects(value)
                : objects(object(value)['entries'] ?? object(value)['items']);
            return RefreshIndicator(
              onRefresh: () async {
                reload();
                await data;
              },
              child: ListView(
                children: [
                  for (final row in rows) widget.item(row, reload),
                  if (rows.isEmpty)
                    const ListTile(title: Text('Nothing here yet')),
                ],
              ),
            );
          },
        ),
      ),
    ],
  );
}

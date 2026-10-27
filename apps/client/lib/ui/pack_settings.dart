import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../editor/image_editor.dart';

class PackSettingsPanel extends StatefulWidget {
  final FoundryStore store;
  final Json pack;
  final Future<void> Function() reload;
  const PackSettingsPanel({
    super.key,
    required this.store,
    required this.pack,
    required this.reload,
  });
  @override
  State<PackSettingsPanel> createState() => _PackSettingsPanelState();
}

class _PackSettingsPanelState extends State<PackSettingsPanel> {
  final form = GlobalKey<FormState>();
  late final name = TextEditingController(text: widget.pack['name']);
  late final publisher = TextEditingController(text: widget.pack['publisher']);
  late final description = TextEditingController(
    text: widget.pack['description'] ?? '',
  );
  late bool public = widget.pack['isPublic'] == true,
      approval = widget.pack['requiresApproval'] == true,
      animated = widget.pack['isAnimated'] == true;
  EditedMedia? tray;
  @override
  void dispose() {
    name.dispose();
    publisher.dispose();
    description.dispose();
    super.dispose();
  }

  Future<void> chooseTray() async {
    final file = await FilePicker.pickFile(type: FileType.image);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    final media = await editMedia(context, bytes, file.name, tray: true);
    if (media != null && mounted) setState(() => tray = media);
  }

  Future<void> save() async {
    if (widget.store.busy || !form.currentState!.validate()) return;
    final id = widget.pack['id'];
    await widget.store.run(() async {
      await widget.store.api.request(
        'packs/$id',
        method: 'PATCH',
        data: {
          'name': name.text.trim(),
          'publisher': publisher.text.trim(),
          'description': description.text.trim(),
          'isPublic': public,
          'requiresApproval': approval,
          'isAnimated': animated,
        },
      );
      if (tray != null) {
        await widget.store.upload(id, tray!.bytes, tray!.name, {}, tray: true);
        if (mounted) setState(() => tray = null);
      }
      await widget.reload();
      await widget.store.afterPackMutation(id);
    }, success: 'Pack settings saved');
  }

  @override
  Widget build(BuildContext context) => CallbackShortcuts(
    bindings: {
      const SingleActivator(LogicalKeyboardKey.keyS, control: true): save,
      const SingleActivator(LogicalKeyboardKey.keyS, meta: true): save,
    },
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Pack settings',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              for (final item in [
                (name, 'Name', 128),
                (publisher, 'Publisher', 128),
                (description, 'Description', 500),
              ])
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextFormField(
                    controller: item.$1,
                    decoration: InputDecoration(labelText: item.$2),
                    maxLength: item.$3,
                    maxLines: item.$2 == 'Description' ? 3 : 1,
                    validator: (v) =>
                        item.$2 != 'Description' && (v?.trim().isEmpty ?? true)
                        ? 'Required'
                        : null,
                  ),
                ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Public pack'),
                value: public,
                onChanged: widget.pack['canManage'] == true
                    ? (v) => setState(() => public = v)
                    : null,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Require approval before export'),
                value: approval,
                onChanged: widget.pack['canManage'] == true
                    ? (v) => setState(() => approval = v)
                    : null,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Animated stickers'),
                value: animated,
                onChanged: widget.pack['canManage'] == true
                    ? (v) => setState(() => animated = v)
                    : null,
              ),
              const Divider(height: 24),
              Row(
                children: [
                  SizedBox(
                    width: 64,
                    height: 64,
                    child: tray != null
                        ? Image.memory(tray!.bytes)
                        : FutureBuilder<Uint8List?>(
                            future: widget.store.cover(widget.pack),
                            builder: (_, s) => s.hasData
                                ? Image.memory(s.data!)
                                : const Icon(Icons.image_outlined),
                          ),
                  ),
                  const SizedBox(width: 12),
                  OutlinedButton.icon(
                    onPressed: chooseTray,
                    icon: const Icon(Icons.image_outlined),
                    label: Text(
                      tray == null
                          ? 'Change tray icon'
                          : 'Change pending tray icon',
                    ),
                  ),
                  if (tray != null)
                    IconButton(
                      tooltip: 'Discard pending tray icon',
                      onPressed: () => setState(() => tray = null),
                      icon: const Icon(Icons.close),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: widget.store.busy ? null : save,
                icon: const Icon(Icons.save_outlined),
                label: const Text('Save changes'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

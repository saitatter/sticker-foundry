import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../importing/session.dart';
import '../importing/source.dart';

class ImportStickersScreen extends StatefulWidget {
  final FoundryStore store;
  const ImportStickersScreen({super.key, required this.store});
  @override
  State<ImportStickersScreen> createState() => _ImportStickersScreenState();
}

class _ImportStickersScreenState extends State<ImportStickersScreen> {
  late final session = ImportSession(widget.store);
  final name = TextEditingController(text: 'Imported stickers');
  late final publisher = TextEditingController(
    text: widget.store.user?['displayName'] ?? 'Sticker Foundry',
  );
  String? pickerError;
  bool picking = false;

  Future<void> choose({required bool folder}) async {
    setState(() {
      picking = true;
      pickerError = null;
    });
    try {
      final selection = await (folder ? chooseFolder() : chooseImages());
      if (selection != null && mounted) await session.analyze(selection);
    } catch (e) {
      if (mounted) setState(() => pickerError = userMessage(e));
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  @override
  void dispose() {
    session.dispose();
    name.dispose();
    publisher.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session,
    builder: (context, _) {
      final busy = session.busy || picking;
      return PopScope(
        canPop: !busy,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Import stickers'),
            actions: [
              IconButton(
                tooltip: 'Import help',
                icon: const Icon(Icons.help_outline),
                onPressed: () => showDialog(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Import from WhatsApp'),
                    content: const Text(
                      'Choose the WhatsApp sticker-media folder if Android allows it, or copy .webp files to a folder in Downloads. WhatsApp does not expose every saved pack.\n\nImages in the chosen folder are sent to your server to check their type and generate previews. Packs are created only after you confirm.\n\nIdentical files are skipped. Static and animated images are put in separate packs of up to 30 stickers. Existing imports are kept if you stop or a file fails.',
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Close'),
                      ),
                    ],
                  ),
                ),
              ),
              if (session.busy)
                IconButton(
                  tooltip: 'Stop after current image',
                  onPressed: session.stop,
                  icon: const Icon(Icons.stop_circle_outlined),
                ),
            ],
          ),
          body: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 960),
              child: Column(
                children: [
                  Flexible(
                    child: SingleChildScrollView(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Choose sticker images to preview. Identical files are skipped; static and animated images are separated.',
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Files are checked on your server before you confirm import.',
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              children: [
                                if (supportsFolders)
                                  FilledButton.tonalIcon(
                                    onPressed: busy
                                        ? null
                                        : () => choose(folder: true),
                                    icon: const Icon(Icons.folder_open),
                                    label: const Text('Choose folder'),
                                  ),
                                TextButton.icon(
                                  onPressed: busy
                                      ? null
                                      : () => choose(folder: false),
                                  icon: const Icon(
                                    Icons.photo_library_outlined,
                                  ),
                                  label: const Text('Choose images'),
                                ),
                              ],
                            ),
                            if (pickerError != null || session.error != null)
                              Text(
                                pickerError ?? session.error!,
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.error,
                                ),
                              ),
                            if (session.limited)
                              const Text(
                                'Showing up to 200 images from the first 2,000 folder entries. Choose a smaller folder to import the rest.',
                              ),
                            if (session.busy) ...[
                              const SizedBox(height: 8),
                              LinearProgressIndicator(
                                value: session.total == 0
                                    ? null
                                    : session.processed / session.total,
                              ),
                              Text(
                                session.stopped
                                    ? 'Stopping after the current image…'
                                    : '${session.phase}: ${session.processed}/${session.total}',
                              ),
                            ],
                            if (session.files.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: TextField(
                                      controller: name,
                                      enabled: !busy && session.created.isEmpty,
                                      maxLength: 100,
                                      decoration: const InputDecoration(
                                        labelText: 'Pack name',
                                        counterText: '',
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: TextField(
                                      controller: publisher,
                                      enabled: !busy && session.created.isEmpty,
                                      maxLength: 128,
                                      decoration: const InputDecoration(
                                        labelText: 'Publisher',
                                        counterText: '',
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                '${session.selected.length} selected · ${session.duplicates} duplicate files · ${session.imported} imported',
                              ),
                              if (session.created.isEmpty)
                                Text(
                                  '${session.packCount(false)} static packs · ${session.packCount(true)} animated packs. Up to 30 stickers per pack.',
                                ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: session.files.isEmpty
                        ? const Center(child: Text('No images selected'))
                        : ListView.builder(
                            itemCount: session.files.length,
                            itemBuilder: (context, index) {
                              final file = session.files[index];
                              final subtitle = file.imported
                                  ? 'Imported'
                                  : file.duplicate
                                  ? 'Duplicate file — skipped'
                                  : file.error ??
                                        (file.info == null
                                            ? 'Not checked'
                                            : '${file.animated ? "Animated" : "Static"} · ${file.info!["width"]} × ${file.info!["height"]}');
                              final selectable =
                                  file.info != null &&
                                  !file.duplicate &&
                                  !file.imported;
                              return CheckboxListTile(
                                value: file.selected,
                                onChanged: busy || !selectable
                                    ? null
                                    : (_) => session.toggle(file),
                                title: Text(
                                  file.source.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                subtitle: Text(subtitle),
                                secondary: file.thumbnail == null
                                    ? const Icon(Icons.broken_image_outlined)
                                    : Image.memory(
                                        file.thumbnail!,
                                        width: 48,
                                        height: 48,
                                        fit: BoxFit.contain,
                                        gaplessPlayback: true,
                                      ),
                              );
                            },
                          ),
                  ),
                  if (session.created.isNotEmpty && !busy)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Wrap(
                        spacing: 8,
                        children: [
                          for (final pack in session.created)
                            TextButton.icon(
                              icon: const Icon(Icons.collections_outlined),
                              label: Text(pack['name']),
                              onPressed: () {
                                final router = GoRouter.of(context);
                                Navigator.pop(context);
                                router.go('/app/packs/${pack['id']}/stickers');
                              },
                            ),
                        ],
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        if (session.files.isNotEmpty && !busy)
                          TextButton(
                            onPressed: () {
                              final select = session.files.any(
                                (f) =>
                                    f.info != null &&
                                    !f.imported &&
                                    !f.duplicate &&
                                    !f.selected,
                              );
                              for (final file in session.files.where(
                                (f) =>
                                    f.info != null &&
                                    !f.imported &&
                                    !f.duplicate,
                              )) {
                                file.selected = select;
                              }
                              session.changed();
                            },
                            child: const Text('Select all / none'),
                          ),
                        const Spacer(),
                        FilledButton.icon(
                          onPressed: busy || session.selected.isEmpty
                              ? null
                              : () {
                                  if (name.text.trim().isEmpty ||
                                      publisher.text.trim().isEmpty) {
                                    setState(
                                      () => pickerError =
                                          'Enter a pack name and publisher.',
                                    );
                                    return;
                                  }
                                  setState(() => pickerError = null);
                                  session.importSelected(
                                    name.text,
                                    publisher.text,
                                  );
                                },
                          icon: const Icon(Icons.file_download_outlined),
                          label: Text(
                            session.created.isEmpty
                                ? 'Import selected'
                                : 'Retry selected',
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}

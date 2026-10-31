import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../core/api.dart';
import '../core/store.dart';
import 'source.dart';

class ImportCandidate {
  final ImportSource source;
  Json? info;
  String? error;
  bool duplicate = false, selected = false, imported = false;
  Uint8List? thumbnail;
  ImportCandidate(this.source);
  bool get animated => info?['animated'] == true;
}

class ImportSession extends ChangeNotifier {
  final FoundryStore store;
  final List<ImportCandidate> files = [];
  final List<Json> created = [];
  final Map<bool, Json> targets = {};
  bool busy = false, stopped = false, limited = false, closed = false;
  int processed = 0, total = 0;
  String? error;
  String phase = '';
  final Future<void> Function(Duration) wait;
  ImportSession(this.store, {Future<void> Function(Duration)? wait})
    : wait = wait ?? Future<void>.delayed;
  Iterable<ImportCandidate> get selected => files.where(
    (f) => f.info != null && f.selected && !f.imported && !f.duplicate,
  );
  int get imported => files.where((f) => f.imported).length;
  int get duplicates => files.where((f) => f.duplicate).length;
  int packCount(bool animated) =>
      (selected.where((f) => f.animated == animated).length / 30).ceil();
  void changed() {
    if (!closed) notifyListeners();
  }

  void stop() {
    stopped = true;
    changed();
  }

  void toggle(ImportCandidate file) {
    file.selected = !file.selected;
    changed();
  }

  bool active(String scope) =>
      !closed && !stopped && store.user != null && store.scope == scope;

  Future<bool> upload(
    String scope,
    Json pack,
    ImportCandidate file,
    Uint8List bytes,
  ) async {
    for (var attempt = 0; ; attempt++) {
      if (!active(scope)) return false;
      try {
        await store.importSticker(pack['id'], bytes, file.source.name);
        return true;
      } on ApiError catch (e) {
        if (e.status != 429 || attempt >= 2) rethrow;
        var seconds = (e.retryAfterSeconds ?? 30).clamp(1, 120);
        while (seconds > 0) {
          if (!active(scope)) return false;
          phase = 'Server limit: retrying in $seconds seconds';
          changed();
          await wait(const Duration(seconds: 1));
          seconds--;
        }
        phase = 'Importing stickers';
      }
    }
  }

  Future<void> analyze(ImportSelection selection) async {
    if (busy) return;
    files.clear();
    targets.clear();
    created.clear();
    limited = selection.limited;
    busy = true;
    stopped = false;
    error = null;
    processed = 0;
    total = selection.files.length;
    phase = 'Checking images';
    changed();
    final scope = store.scope;
    final hashes = <String>{};
    try {
      for (final source in selection.files) {
        if (!active(scope)) break;
        final file = ImportCandidate(source);
        files.add(file);
        try {
          final bytes = await source.bytes();
          if (!active(scope)) break;
          final info = object(
            await store.api.request(
              'imports/inspect',
              method: 'POST',
              file: bytes,
              fileName: source.name,
            ),
          );
          if (!active(scope)) break;
          file.info = info;
          file.thumbnail = base64Decode(info['thumbnail']);
          file.duplicate = !hashes.add(info['sha256']);
          file.selected = !file.duplicate;
        } catch (e) {
          file.error = userMessage(e);
          if (e is ApiError && e.status == 401) {
            error = file.error;
            await store.signOut();
            break;
          }
        }
        processed++;
        changed();
      }
    } finally {
      busy = false;
      changed();
    }
  }

  Future<void> importSelected(String name, String publisher) async {
    if (busy || selected.isEmpty) return;
    busy = true;
    stopped = false;
    error = null;
    processed = 0;
    final pending = selected.toList();
    total = pending.length;
    phase = 'Importing stickers';
    changed();
    final scope = store.scope;
    try {
      for (final file in pending) {
        if (!active(scope)) break;
        file.error = null;
        try {
          final bytes = await file.source.bytes();
          if (!active(scope)) break;
          var pack = targets[file.animated];
          if (pack == null || (pack['_importCount'] as int) >= 30) {
            final kind = file.animated ? 'Animated' : 'Static';
            final index =
                created.where((p) => p['isAnimated'] == file.animated).length +
                1;
            pack = object(
              await store.api.request(
                'packs',
                method: 'POST',
                data: {
                  'name': '${name.trim()} - $kind${index > 1 ? " $index" : ""}',
                  'publisher': publisher.trim(),
                  'isAnimated': file.animated,
                },
              ),
            );
            pack['_importCount'] = 0;
            created.add(pack);
            targets[file.animated] = pack;
          }
          if (!active(scope)) break;
          if (!await upload(scope, pack, file, bytes)) break;
          file.imported = true;
          file.selected = false;
          pack['_importCount'] = (pack['_importCount'] as int) + 1;
        } catch (e) {
          file.error = userMessage(e);
          if (e is ApiError && (e.status == 401 || e.status == 403)) {
            error = file.error;
            if (e.status == 401) await store.signOut();
            break;
          }
        }
        processed++;
        changed();
      }
    } finally {
      if (!closed && store.scope == scope && imported > 0) {
        try {
          await store.refresh();
        } catch (e) {
          error = userMessage(e);
        }
      }
      busy = false;
      changed();
    }
  }

  @override
  void dispose() {
    closed = true;
    super.dispose();
  }
}

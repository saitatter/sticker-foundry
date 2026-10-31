import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

import 'source_web.dart' if (dart.library.io) 'source_native.dart' as platform;

const imageExtensions = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif'];
const importFileLimit = 200;
const importByteLimit = 10 * 1024 * 1024;

class ImportSource {
  final String name;
  final int size;
  final Future<Uint8List> Function() read;
  ImportSource(this.name, this.size, this.read);

  Future<Uint8List> bytes() async {
    if (size > importByteLimit) throw StateError('Image exceeds 10 MB');
    final data = await read();
    if (data.length > importByteLimit) throw StateError('Image exceeds 10 MB');
    return data;
  }
}

class ImportSelection {
  final List<ImportSource> files;
  final bool limited;
  ImportSelection(this.files, {this.limited = false});
}

bool get supportsFolders => platform.supportsFolders;
Future<ImportSelection?> chooseFolder() => platform.chooseFolder();

Future<ImportSelection?> chooseImages() async {
  final files = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: imageExtensions,
  );
  if (files.isEmpty) return null;
  return ImportSelection([
    for (final file in files.take(importFileLimit))
      ImportSource(file.name, await file.length() ?? 0, file.readAsBytes),
  ], limited: files.length > importFileLimit);
}

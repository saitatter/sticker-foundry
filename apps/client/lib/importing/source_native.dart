import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

import '../core/api.dart';
import '../core/native_bridge.dart';
import 'source.dart';

bool get supportsFolders => !Platform.isIOS;

Future<ImportSelection?> chooseFolder() async {
  if (NativeBridge.android) {
    final response = await NativeBridge.channel.invokeMethod(
      'pickImportFolder',
    );
    if (response == null) return null;
    final data = object(response);
    return ImportSelection([
      for (final file in objects(data['files']))
        ImportSource(
          file['name'],
          file['size'],
          () async => (await NativeBridge.channel.invokeMethod<Uint8List>(
            'readImportFile',
            {'uri': file['uri']},
          ))!,
        ),
    ], limited: data['limited'] == true);
  }
  final path = await FilePicker.getDirectoryPath();
  if (path == null) return null;
  final files = <ImportSource>[];
  var examined = 0;
  await for (final entity in Directory(
    path,
  ).list(recursive: true, followLinks: false)) {
    examined++;
    if (entity is File &&
        imageExtensions.contains(entity.path.split('.').last.toLowerCase())) {
      final stat = await entity.stat();
      files.add(
        ImportSource(
          entity.uri.pathSegments.last,
          stat.size,
          entity.readAsBytes,
        ),
      );
    }
    if (files.length >= importFileLimit || examined >= 2000) break;
  }
  return ImportSelection(
    files,
    limited: files.length >= importFileLimit || examined >= 2000,
  );
}

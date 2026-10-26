import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'cache.dart';

AssetCache createCache() => DiskCache();

class DiskCache implements AssetCache {
  Future<Directory> get root async => Directory(
    p.join(
      (await getApplicationSupportDirectory()).path,
      'sticker_foundry',
      'cache',
    ),
  );
  Future<File> file(String key) async {
    final dir = await root;
    final path = p.normalize(p.join(dir.path, key));
    if (!p.isWithin(dir.path, path)) throw ArgumentError('Invalid cache key');
    return File(path);
  }

  @override
  Future<Uint8List?> read(String key) async {
    final f = await file(key);
    return await f.exists() ? f.readAsBytes() : null;
  }

  @override
  Future<void> write(String key, Uint8List bytes) async {
    final f = await file(key);
    await f.parent.create(recursive: true);
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsBytes(bytes, flush: true);
    if (await f.exists()) await f.delete();
    await tmp.rename(f.path);
  }

  @override
  Future<void> remove(String key) async {
    final f = await file(key);
    if (await f.exists()) await f.delete();
  }

  @override
  Future<void> clear() async {
    final dir = await root;
    if (await dir.exists()) await dir.delete(recursive: true);
  }
}

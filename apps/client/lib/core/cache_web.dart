import 'dart:typed_data';

import 'package:idb_shim/idb_browser.dart';

import 'cache.dart';

AssetCache createCache() => BrowserCache();

class BrowserCache implements AssetCache {
  late final Future<Database> database = idbFactoryBrowser.open(
    'sticker-foundry-cache',
    version: 1,
    onUpgradeNeeded: (event) {
      event.database.createObjectStore('assets');
    },
  );
  @override
  Future<Uint8List?> read(String key) async {
    final db = await database;
    final tx = db.transaction('assets', idbModeReadOnly);
    final value = await tx.objectStore('assets').getObject(key);
    await tx.completed;
    return value == null
        ? null
        : Uint8List.fromList((value as List).cast<int>());
  }

  @override
  Future<void> write(String key, Uint8List bytes) async {
    final db = await database;
    final tx = db.transaction('assets', idbModeReadWrite);
    await tx.objectStore('assets').put(bytes, key);
    await tx.completed;
  }

  @override
  Future<void> remove(String key) async {
    final db = await database;
    final tx = db.transaction('assets', idbModeReadWrite);
    await tx.objectStore('assets').delete(key);
    await tx.completed;
  }

  @override
  Future<void> clear() async {
    final db = await database;
    final tx = db.transaction('assets', idbModeReadWrite);
    await tx.objectStore('assets').clear();
    await tx.completed;
  }
}

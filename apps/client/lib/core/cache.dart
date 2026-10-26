import 'dart:typed_data';

import 'cache_native.dart'
    if (dart.library.js_interop) 'cache_web.dart'
    as platform;

abstract interface class AssetCache {
  Future<Uint8List?> read(String key);
  Future<void> write(String key, Uint8List bytes);
  Future<void> remove(String key);
  Future<void> clear();
}

AssetCache createCache() => platform.createCache();

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class NativeBridge {
  static Future<void> removePack(String id) async {
    if (android) await channel.invokeMethod('removePack', {'id': id});
  }

  static const channel = MethodChannel('com.stickerfoundry.app/native');
  static bool get android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  static Future<void> installPack(
    Map<String, dynamic> pack,
    Uint8List zip,
  ) async {
    if (android) {
      await channel.invokeMethod('installPack', {'pack': pack, 'zip': zip});
    }
  }

  static Future<void> clear() async {
    if (android) await channel.invokeMethod('clearCache');
  }

  static Future<bool> added(String id, {bool business = false}) async =>
      android &&
      (await channel.invokeMethod<bool>('isPackAdded', {
            'id': id,
            'business': business,
          }) ??
          false);
  static Future<String> importPack(String id, {bool business = false}) async {
    if (!android) {
      throw StateError(
        'WhatsApp sticker import is available on Android. Export the pack on this device.',
      );
    }
    return await channel.invokeMethod<String>('importPack', {
          'id': id,
          'business': business,
        }) ??
        'Import cancelled';
  }

  static Future<void> openWhatsApp({bool business = false}) async {
    if (android) {
      await channel.invokeMethod('openWhatsApp', {'business': business});
    }
  }
}

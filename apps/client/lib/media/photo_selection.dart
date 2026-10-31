import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

class RecoveredPhoto {
  final String packId;
  final List<XFile> files;
  RecoveredPhoto(this.packId, this.files);
}

class PhotoSelection {
  static const pendingKey = 'pendingPhotoSelection';
  static bool get android =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<List<XFile>> pick({
    required SharedPreferences prefs,
    required String scope,
    required String packId,
    required ImageSource source,
    CameraDevice camera = CameraDevice.rear,
    ImagePicker? picker,
    int? limit,
  }) async {
    final service = picker ?? ImagePicker();
    if (android) {
      await prefs.setString(
        pendingKey,
        jsonEncode({'scope': scope, 'packId': packId}),
      );
    }
    try {
      if (source == ImageSource.gallery) {
        return await service.pickMultiImage(
          requestFullMetadata: false,
          limit: limit,
        );
      }
      final file = await service.pickImage(
        source: source,
        preferredCameraDevice: camera,
        maxWidth: 4096,
        maxHeight: 4096,
        imageQuality: 95,
        requestFullMetadata: false,
      );
      return file == null ? [] : [file];
    } finally {
      if (android) await prefs.remove(pendingKey);
    }
  }

  static Future<RecoveredPhoto?> recover(
    SharedPreferences prefs,
    String? scope, {
    ImagePicker? picker,
  }) async {
    if (!android) return null;
    final saved = prefs.getString(pendingKey);
    try {
      final lost = await (picker ?? ImagePicker()).retrieveLostData();
      if (saved == null || scope == null) {
        await prefs.remove(pendingKey);
        return null;
      }
      final data = jsonDecode(saved) as Map<String, dynamic>;
      if (data['scope'] != scope) {
        await prefs.remove(pendingKey);
        return null;
      }
      final files =
          lost.files ??
          [
            for (final path in data['paths'] as List? ?? [])
              XFile(path as String),
          ];
      if (files.isEmpty) {
        await prefs.remove(pendingKey);
        return null;
      }
      await prefs.setString(
        pendingKey,
        jsonEncode({...data, 'paths': files.map((file) => file.path).toList()}),
      );
      return RecoveredPhoto(data['packId'] as String, files);
    } catch (_) {
      await prefs.remove(pendingKey);
      return null;
    }
  }
}

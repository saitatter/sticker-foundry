import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'cache.dart';
import 'native_bridge.dart';

class FoundryStore extends ChangeNotifier {
  void changed() => notifyListeners();
  final AssetCache cache;
  final secure = const FlutterSecureStorage(
    mOptions: MacOsOptions(usesDataProtectionKeychain: false),
  );
  late SharedPreferences prefs;
  late FoundryApi api;
  Json? user;
  List<Json> packs = [], publicPacks = [], teams = [], jobs = [];
  Map<String, Json> cached = {};
  final Map<String, Uint8List> images = {};
  final Map<String, Future<Uint8List?>> covers = {};
  bool initialized = false, busy = false, offline = false, dark = false;
  String? error, notice;
  String instanceName = 'Sticker Foundry';
  FoundryStore({AssetCache? cache}) : cache = cache ?? createCache();
  bool get admin => user?['isAdmin'] == true;
  String get scope => '${api.baseUrl}|${user?['id']}';
  Iterable<Json> get library => offline ? cached.values : packs;

  Future<void> initialize() async {
    prefs = await SharedPreferences.getInstance();
    dark = prefs.getBool('dark') ?? false;
    final configured = const String.fromEnvironment('API_BASE_URL');
    final defaultUrl = kIsWeb
        ? Uri.base.resolve('/api/').toString()
        : 'http://127.0.0.1:8080/api/';
    api = FoundryApi(
      normalizeServer(
        prefs.getString('server') ??
            (configured.isEmpty ? defaultUrl : configured),
      ),
    );
    api.onRefresh = (data) async {
      user = object(data['user']);
      await persist();
    };
    try {
      Json? session;
      if (!kIsWeb) {
        final stored = await secure.read(key: 'session');
        if (stored != null) session = object(jsonDecode(stored));
        if (session == null && !(prefs.getBool('legacyImported') ?? false)) {
          final legacy = await NativeBridge.legacySession();
          if (legacy?['accessToken'] != null ||
              legacy?['refreshToken'] != null) {
            api.baseUrl = normalizeServer(legacy!['serverUrl']);
            api.accessToken = legacy['accessToken'];
            api.refreshToken = legacy['refreshToken'];
            user = object(await api.request('auth/me'));
            await clearCache();
            await persist();
            await NativeBridge.clearLegacySession();
          }
          await prefs.setBool('legacyImported', true);
        }
      } else {
        final saved = prefs.getString('profile');
        if (saved != null) session = object(jsonDecode(saved));
      }
      if (session != null && session['server'] == api.baseUrl) {
        user = object(session['user']);
        api.accessToken = session['accessToken'];
        api.refreshToken = session['refreshToken'];
      }
      final index = await cache.read('index.json');
      if (index != null) {
        final saved = object(jsonDecode(utf8.decode(index)));
        if (saved['owner'] == scope) {
          cached = objects(saved['packs'])
              .asMap()
              .map((_, p) => MapEntry(p['id'] as String, p));
        } else {
          await clearCache();
        }
      }
      if (user != null || kIsWeb) {
        try {
          if (kIsWeb || api.accessToken == null) await api.refresh();
          user = object(await api.request('auth/me'));
          await persist();
          await refresh();
        } on ApiError catch (e) {
          if (e.status == 401 || e.status == 403) {
            await signOut();
          } else {
            offline = true;
          }
        } catch (_) {
          offline = user != null;
        }
      }
      try {
        final instance = object(await api.request('instance', auth: false));
        instanceName = instance['instanceName'] ?? instanceName;
      } catch (_) {}
    } catch (e) {
      error = 'Could not restore session: $e';
    }
    initialized = true;
    notifyListeners();
  }

  Future<void> persist() async {
    if (user == null) return;
    await prefs.setString('server', api.baseUrl);
    final data = {
      'server': api.baseUrl,
      'user': user,
      if (!kIsWeb) 'accessToken': api.accessToken,
      if (!kIsWeb) 'refreshToken': api.refreshToken,
    };
    if (kIsWeb) {
      await prefs.setString('profile', jsonEncode(data));
    } else {
      await secure.write(key: 'session', value: jsonEncode(data));
    }
  }

  Future<void> authenticate(
    String email,
    String password, {
    String? name,
    String? invite,
  }) async {
    final data = object(
      await api.request(
        name == null ? 'auth/login' : 'auth/register',
        method: 'POST',
        auth: false,
        data: {
          'email': email.trim(),
          'password': password,
          'displayName': ?name,
          if (invite != null && invite.isNotEmpty) 'inviteCode': invite,
        },
      ),
    );
    if (user?['id'] != object(data['user'])['id']) await clearCache();
    api.accessToken = data['accessToken'];
    api.refreshToken = kIsWeb ? null : data['refreshToken'];
    user = object(data['user']);
    offline = false;
    await persist();
    await refresh();
  }

  Future<void> signOut() async {
    try {
      await api.request(
        'auth/logout',
        method: 'POST',
        auth: false,
        data: kIsWeb ? {} : {'refreshToken': api.refreshToken},
      );
    } catch (_) {}
    api.accessToken = null;
    api.refreshToken = null;
    user = null;
    packs = [];
    teams = [];
    jobs = [];
    publicPacks = [];
    offline = false;
    await prefs.remove('profile');
    if (!kIsWeb) await secure.delete(key: 'session');
    await clearCache();
    notifyListeners();
  }

  Future<void> server(String value) async {
    final url = normalizeServer(value);
    if (api.baseUrl != url) {
      await signOut();
      api.baseUrl = url;
      await prefs.setString('server', url);
    }
  }

  Future<void> theme(bool value) async {
    dark = value;
    await prefs.setBool('dark', value);
    notifyListeners();
  }

  Future<void> refresh() async {
    final owner = scope;
    final freshPacks = objects(await api.request('packs'));
    if (scope != owner) return;
    final freshTeams = objects(await api.request('teams'));
    if (scope != owner) return;
    packs = freshPacks;
    teams = freshTeams;
    offline = false;
    notifyListeners();
  }

  Future<Json> pack(String id) async {
    try {
      final value = object(await api.request('packs/$id'));
      offline = false;
      return value;
    } on ApiError catch (e) {
      if (e.status == 403 || e.status == 404) await removeCachedPack(id);
      rethrow;
    } catch (_) {
      if (cached.containsKey(id)) {
        offline = true;
        return cached[id]!;
      }
      rethrow;
    }
  }

  Future<void> _cacheQueue = Future<void>.value();
  int _cacheGeneration = 0;

  Future<void> clearCache() async {
    _cacheGeneration++;
    final pending = _cacheQueue;
    final clear = pending.then((_) => _clearCache());
    _cacheQueue = clear.catchError((Object _) {});
    await clear;
  }

  Future<void> _clearCache() async {
    covers.clear();
    cached.clear();
    images.clear();
    await cache.clear();
    await NativeBridge.clear();
    notifyListeners();
  }

  Future<void> _index() => cache.write(
    'index.json',
    Uint8List.fromList(
      utf8.encode(
        jsonEncode({'owner': scope, 'packs': cached.values.toList()}),
      ),
    ),
  );

  Future<void> removeCachedPack(String id) async {
    final old = cached.remove(id);
    await NativeBridge.removePack(id);
    if (old != null) {
      for (final name in (old['_assets'] as List? ?? [])) {
        await cache.remove('${old['_assetRoot'] ?? id}/$name');
      }
    }
    images.clear();
    covers.clear();
    await _index();
  }

  Future<void> sync({String? id}) {
    final owner = scope, generation = _cacheGeneration;
    final result = _cacheQueue.then((_) async {
      if (owner != scope || generation != _cacheGeneration) return;
      await _sync(id: id, owner: owner, generation: generation);
    });
    _cacheQueue = result.catchError((Object _) {});
    return result;
  }

  Future<void> _sync({
    String? id,
    required String owner,
    required int generation,
  }) async {
    bool current() => owner == scope && generation == _cacheGeneration;
    final remote = objects(object(await api.request('sync/packs'))['packs']);
    if (!current()) return;
    final allowed = remote
        .where((p) => p['canExport'] == true)
        .map((p) => p['id'])
        .toSet();
    for (final stale
        in cached.keys.where((key) => !allowed.contains(key)).toList()) {
      if (!current()) return;
      await removeCachedPack(stale);
    }
    for (final item in remote.where(
      (p) => p['canExport'] == true && (id == null || p['id'] == id),
    )) {
      if (!current()) return;
      final key = item['id'] as String;
      if (cached[key]?['_syncHash'] == item['syncHash']) continue;
      final zip =
          await api.request('packs/$key/export', raw: true) as Uint8List;
      final archive = ZipDecoder().decodeBytes(zip);
      final detail = object(await api.request('packs/$key'));
      if (!current()) return;
      final old = cached[key];
      // Publish the index only after the complete revision and native import succeed.
      final root = '$key/revision-${DateTime.now().microsecondsSinceEpoch}';
      final assetNames = <String>[];
      try {
        for (final file in archive.files.where((f) => f.isFile)) {
          if (file.name.startsWith('/') ||
              file.name.contains('..') ||
              file.name.contains('\\')) {
            throw const FormatException('Unsafe export archive');
          }
          if (!current()) return;
          assetNames.add(file.name);
          await cache.write(
            '$root/${file.name}',
            Uint8List.fromList(file.content),
          );
        }
        detail['_assets'] = assetNames;
        detail['_assetRoot'] = root;
        detail['_syncHash'] = item['syncHash'];
        if (!current()) return;
        await NativeBridge.installPack({...detail, ...item}, zip);
        if (!current()) return;
        cached[key] = detail;
        try {
          await _index();
        } catch (_) {
          if (old == null) {
            cached.remove(key);
          } else {
            cached[key] = old;
          }
          rethrow;
        }
        if (old != null) {
          for (final name in (old['_assets'] as List? ?? [])) {
            await cache.remove('${old['_assetRoot'] ?? key}/$name');
          }
        }
      } finally {
        if (cached[key]?['_assetRoot'] != root) {
          for (final name in assetNames) {
            await cache.remove('$root/$name');
          }
        }
      }
    }
    if (!current()) return;
    images.clear();
    covers.clear();
    await refresh();
    notifyListeners();
  }

  Future<void> afterPackMutation(String id) async {
    images.clear();
    covers.clear();
    await refresh();
    // A failed background download must not make a successful edit look unsaved.
    if (NativeBridge.android || cached.containsKey(id)) {
      try {
        await sync(id: id);
      } catch (e) {
        notice = 'Saved online. Refresh the offline download: $e';
      }
    }
  }

  Future<Uint8List?> sticker(Json pack, Json sticker) async {
    final key = '${pack['id']}/${sticker['fileName']}';
    final imageKey = '$key/${pack['imageDataVersion']}/${sticker['sha256']}';
    if (images.containsKey(imageKey)) return images[imageKey];
    if (cached[pack['id']]?['imageDataVersion'] == pack['imageDataVersion']) {
      final bytes = await cache.read(
        '${cached[pack['id']]?['_assetRoot'] ?? pack['id']}/${sticker['fileName']}',
      );
      if (bytes != null) {
        images[imageKey] = bytes;
        return bytes;
      }
    }
    if (offline) {
      return cache.read(
        '${cached[pack['id']]?['_assetRoot'] ?? pack['id']}/${sticker['fileName']}',
      );
    }
    final bytes = await api.request(
      'packs/${pack['id']}/stickers/${sticker['id']}/file',
      raw: true,
    ) as Uint8List;
    images[imageKey] = bytes;
    return bytes;
  }

  Future<Uint8List?> cover(Json pack, {bool public = false}) {
    if (pack['stickerCount'] == 0) return Future.value(null);
    final key = '${pack['id']}/${pack['imageDataVersion']}/$public/$offline';
    return covers.putIfAbsent(key, () => _cover(pack, public: public));
  }

  Future<Uint8List?> _cover(Json pack, {bool public = false}) async {
    final key = '${pack['id']}/${pack['imageDataVersion']}/cover/$public';
    if (images.containsKey(key)) return images[key];
    if (!public &&
        cached[pack['id']]?['imageDataVersion'] == pack['imageDataVersion']) {
      final bytes = await cache.read(
        '${cached[pack['id']]?['_assetRoot'] ?? pack['id']}/tray_icon.webp',
      );
      if (bytes != null) return images[key] = bytes;
    }
    if (offline) return null;
    try {
      final bytes = await api.request(
        '${public ? 'public/' : ''}packs/${pack['id']}/cover',
        auth: !public,
        raw: true,
      ) as Uint8List;
      return images[key] = bytes;
    } catch (_) {
      return null;
    }
  }

  Future<Json> track(Json job, String packId) async {
    final owner = scope;
    var current = {...job, 'packId': packId};
    void update() {
      jobs = [...jobs.where((j) => j['id'] != current['id']), current];
      notifyListeners();
    }

    update();
    while ([
      'QUEUED',
      'PROCESSING',
      'RUNNING',
      'PENDING',
    ].contains(current['status'])) {
      await Future<void>.delayed(const Duration(milliseconds: 1000));
      if (scope != owner || user == null) throw StateError('Session changed');
      final response = await api.request('jobs/${job['id']}');
      if (scope != owner || user == null) throw StateError('Session changed');
      current = {...object(response), 'packId': packId};
      update();
    }
    if (current['status'] != 'COMPLETED') {
      throw StateError(current['error'] ?? 'Job ${current['status']}');
    }
    return current;
  }

  Future<void> upload(
    String packId,
    Uint8List bytes,
    String filename,
    Json options, {
    String? replace,
    bool tray = false,
  }) async {
    final detail = await pack(packId);
    final path = tray
        ? 'packs/$packId/tray-icon'
        : replace != null
        ? 'packs/$packId/stickers/$replace/file'
        : 'packs/$packId/stickers/jobs';
    final result = await api.request(
      path,
      method: replace == null ? 'POST' : 'PUT',
      file: bytes,
      fileName: filename,
      fields: options,
      version: '${detail['imageDataVersion']}',
    );
    if (!tray && replace == null) {
      await track({...object(result), 'label': filename}, packId);
    }
    images.clear();
    await refresh();
    await afterPackMutation(packId);
  }

  Future<Uint8List> export(String id) async {
    await track(
      object(
        await api.request('packs/$id/export/jobs', method: 'POST', data: {}),
      ),
      id,
    );
    return await api.request('packs/$id/export', raw: true) as Uint8List;
  }

  int _operations = 0;
  Future<void> run(Future<void> Function() action, {String? success}) async {
    error = null;
    notice = null;
    _operations++;
    busy = true;
    notifyListeners();
    try {
      await action();
      notice = success ?? notice;
    } catch (e) {
      if (e is ApiError && e.status == 401) {
        await signOut();
      }
      error = e.toString();
    } finally {
      busy = --_operations > 0;
      notifyListeners();
    }
  }
}

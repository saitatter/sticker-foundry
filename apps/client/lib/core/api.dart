import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';

import 'http_client.dart'
    if (dart.library.js_interop) 'http_client_web.dart'
    as platform;

typedef Json = Map<String, dynamic>;
Json object(Object? value) => Map<String, dynamic>.from(value as Map);
List<Json> objects(Object? value) =>
    (value as List? ?? []).map(object).toList();

String normalizeServer(String input) {
  final text = input.trim();
  final uri = Uri.tryParse(text.contains('://') ? text : 'http://$text');
  if (uri == null ||
      !['http', 'https'].contains(uri.scheme) ||
      uri.host.isEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      uri.userInfo.isNotEmpty) {
    throw const FormatException(
      'Enter a valid HTTP or HTTPS server URL without query parameters.',
    );
  }
  final path = uri.path.isEmpty || uri.path == '/'
      ? '/api/'
      : '${uri.path.replaceAll(RegExp(r'/+$'), '')}/';
  return uri.replace(path: path).toString();
}

class ApiError implements Exception {
  final int status;
  final String message;
  ApiError(this.status, this.message);
  @override
  String toString() => message;
}

String userMessage(Object? error) {
  if (error is http.ClientException) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  if (error is TimeoutException) {
    return 'The server took too long to respond. Try again.';
  }
  if (error is ApiError) return error.message;
  if (error is FormatException) return error.message;
  if (error is StateError) return error.message;
  if (error is PlatformException) {
    return error.message ?? 'The device could not complete this action.';
  }
  if (error is String) return error;
  return 'The action could not be completed. Try again.';
}

class FoundryApi {
  final http.Client client;
  String baseUrl;
  String? accessToken;
  String? refreshToken;
  Future<void> Function(Json)? onRefresh;
  Future<void>? _refreshing;
  FoundryApi(this.baseUrl, {http.Client? client})
    : client = client ?? platform.createClient();

  Future<void> refresh({Duration timeout = const Duration(seconds: 90)}) =>
      _refreshing ??= _refresh(timeout).whenComplete(() => _refreshing = null);
  Future<void> _refresh(Duration timeout) async {
    final data = object(
      await request(
        'auth/refresh',
        method: 'POST',
        data: kIsWeb ? {} : {'refreshToken': refreshToken},
        auth: false,
        timeout: timeout,
      ),
    );
    accessToken = data['accessToken'];
    if (!kIsWeb) refreshToken = data['refreshToken'];
    await onRefresh?.call(data);
  }

  Future<dynamic> request(
    String path, {
    String method = 'GET',
    Json? data,
    bool auth = true,
    bool raw = false,
    Uint8List? file,
    String fileName = 'sticker.png',
    Json? fields,
    String? version,
    bool retry = true,
    Duration timeout = const Duration(seconds: 90),
  }) async {
    final uri = Uri.parse(baseUrl).resolve(path);
    final http.BaseRequest req;
    if (file != null) {
      final upload = http.MultipartRequest(method, uri);
      upload.files.add(
        http.MultipartFile.fromBytes(
          'file',
          file,
          filename: fileName,
          contentType: MediaType.parse(
            lookupMimeType(fileName, headerBytes: file.take(16).toList()) ??
                'application/octet-stream',
          ),
        ),
      );
      upload.fields.addAll(
        (fields ?? {}).map(
          (key, value) => MapEntry(
            key,
            value is List ? jsonEncode(value) : value.toString(),
          ),
        ),
      );
      req = upload;
    } else {
      final body = http.Request(method, uri);
      if (data != null) {
        body.headers['Content-Type'] = 'application/json';
        body.body = jsonEncode(data);
      }
      req = body;
    }
    if (auth && accessToken != null) {
      req.headers['Authorization'] = 'Bearer $accessToken';
    }
    if (kIsWeb) req.headers['X-Refresh-Cookie'] = 'true';
    if (version != null) req.headers['If-Match'] = version;
    final response = await client
        .send(req)
        .then(http.Response.fromStream)
        .timeout(timeout);
    if (response.statusCode == 401 && auth && retry) {
      await refresh(timeout: timeout);
      return request(
        path,
        method: method,
        data: data,
        auth: auth,
        raw: raw,
        file: file,
        fileName: fileName,
        fields: fields,
        version: version,
        retry: false,
        timeout: timeout,
      );
    }
    if (response.statusCode >= 400) {
      String message = 'Server returned ${response.statusCode}';
      try {
        final error = object(jsonDecode(response.body));
        final msg = error['message'];
        message = msg is List ? msg.join('\n') : msg?.toString() ?? message;
      } catch (_) {}
      throw ApiError(response.statusCode, message);
    }
    if (raw) return response.bodyBytes;
    if (response.body.isEmpty) return null;
    return jsonDecode(utf8.decode(response.bodyBytes));
  }
}

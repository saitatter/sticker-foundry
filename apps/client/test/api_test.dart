import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sticker_foundry/core/api.dart';

void main() {
  test('server addresses preserve prefixes and reject credentials', () {
    expect(normalizeServer('localhost:8080'), 'http://localhost:8080/api/');
    expect(
      normalizeServer('https://example.test/foundry/api/'),
      'https://example.test/foundry/api/',
    );
    for (final address in [
      'https://user:secret@example.test',
      'https://example.test/?token=1',
      'file:///tmp',
    ]) {
      expect(() => normalizeServer(address), throwsFormatException);
    }
  });
  test(
    'concurrent expired requests rotate once and replay their bodies',
    () async {
      var refreshes = 0;
      final writes = <String>[];
      final api =
          FoundryApi(
              'https://example.test/api/',
              client: MockClient((request) async {
                if (request.url.path.endsWith('/auth/refresh')) {
                  refreshes++;
                  await Future<void>.delayed(const Duration(milliseconds: 20));
                  return http.Response(
                    jsonEncode({
                      'accessToken': 'new-access',
                      'refreshToken': 'new-refresh',
                      'user': {'id': 'u'},
                    }),
                    200,
                  );
                }
                if (request.headers['Authorization'] != 'Bearer new-access') {
                  return http.Response('{}', 401);
                }
                writes.add(request.body);
                return http.Response('{"ok":true}', 200);
              }),
            )
            ..accessToken = 'expired'
            ..refreshToken = 'old-refresh';
      await Future.wait([
        api.request('packs/a', method: 'PATCH', data: {'name': 'First'}),
        api.request('packs/b', method: 'PATCH', data: {'name': 'Second'}),
      ]);
      expect(refreshes, 1);
      expect(api.refreshToken, 'new-refresh');
      expect(
        writes.map(jsonDecode),
        containsAll([
          {'name': 'First'},
          {'name': 'Second'},
        ]),
      );
    },
  );
  test('validation errors retain server messages', () async {
    final api = FoundryApi(
      'https://example.test/api/',
      client: MockClient(
        (_) async =>
            http.Response('{"message":["Too large","Invalid type"]}', 400),
      ),
    );
    await expectLater(
      api.request('packs'),
      throwsA(
        isA<ApiError>().having(
          (e) => e.message,
          'message',
          'Too large\nInvalid type',
        ),
      ),
    );
  });
}

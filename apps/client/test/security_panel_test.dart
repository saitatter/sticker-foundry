import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/ui/settings_panels.dart';

class SecurityStore extends FoundryStore {
  bool downloadsCleared = false;
  @override
  Future<void> clearCache() async {
    downloadsCleared = true;
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  for (final current in [true, false]) {
    testWidgets(
      'revoking ${current ? "this" : "another"} device handles local access',
      (tester) async {
        final store = SecurityStore();
        store.prefs = await SharedPreferences.getInstance();
        store.user = {'id': 'owner'};
        var revoked = false;
        store.api = FoundryApi(
          'http://example.test/api/',
          client: MockClient((request) async {
            if (request.method == 'DELETE') {
              expect(request.url.path, '/api/auth/sessions/session');
              revoked = true;
              return http.Response('{"revoked":true}', 200);
            }
            if (request.url.path.endsWith('/logout')) {
              return http.Response('{}', 200);
            }
            return http.Response(
              jsonEncode(
                revoked
                    ? []
                    : [
                        {
                          'id': 'session',
                          'userAgent': 'Other phone',
                          'isCurrent': current,
                        },
                      ],
              ),
              200,
            );
          }),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(body: SecurityPanel(store: store)),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(current ? 'This device' : 'Other phone'),
          findsOneWidget,
        );
        await tester.tap(find.byTooltip('Revoke session'));
        await tester.pumpAndSettle();
        expect(revoked, isTrue);
        expect(store.user == null, current);
        expect(store.downloadsCleared, current);
        expect(find.byTooltip('Revoke session'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/ui/app.dart';
import 'package:sticker_foundry/ui/common.dart';

class ResetStore extends FoundryStore {
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

  testWidgets(
    'reset validates confirmation and clears the old signed-in session',
    (tester) async {
      final store = ResetStore()..initialized = true;
      store.prefs = await SharedPreferences.getInstance();
      store.user = {'id': 'old-user'};
      var resets = 0;
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient((request) async {
          if (request.url.path.endsWith('/reset/confirm')) {
            resets++;
            expect(jsonDecode(request.body), {
              'token': 'fixture',
              'newPassword': '  new password  ',
            });
            expect(request.headers['Authorization'], isNull);
          }
          return http.Response('{}', 200);
        }),
      )..accessToken = 'old-access';
      final router = createFoundryRouter(
        store,
        initialLocation: '/reset-password?token=fixture',
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'New password'),
        '  new password  ',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Confirm password'),
        'wrong confirmation',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Reset password'));
      await tester.pumpAndSettle();
      expect(find.text('Passwords do not match'), findsOneWidget);
      expect(resets, 0);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Confirm password'),
        '  new password  ',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Reset password'));
      await tester.pumpAndSettle();
      expect(resets, 1);
      expect(store.user, isNull);
      expect(store.api.accessToken, isNull);
      expect(store.downloadsCleared, isTrue);
      expect(router.routeInformationProvider.value.uri.path, '/login');
      expect(
        find.text('Password reset. Sign in with your new password.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'expired reset links show an actionable error without losing the form',
    (tester) async {
      final store = ResetStore()..initialized = true;
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient(
          (_) async => http.Response(
            '{"message":"Password reset token is invalid or expired"}',
            400,
          ),
        ),
      );
      final router = createFoundryRouter(
        store,
        initialLocation: '/reset-password?token=expired',
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pumpAndSettle();
      for (final label in ['New password', 'Confirm password']) {
        await tester.enterText(
          find.widgetWithText(TextFormField, label),
          'new-password',
        );
      }
      await tester.tap(find.widgetWithText(FilledButton, 'Reset password'));
      await tester.pumpAndSettle();
      expect(
        find.text('Password reset token is invalid or expired'),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(FilledButton, 'Reset password'),
        findsOneWidget,
      );
      expect(store.downloadsCleared, isFalse);
    },
  );

  testWidgets(
    'secret fields preserve password whitespace while other fields trim it',
    (tester) async {
      Json? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  result = await formDialog(
                    context,
                    'Change password',
                    {'name': 'Name', 'password': 'Password'},
                    secrets: {'password'},
                  );
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Name'),
        ' Name ',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        ' password ',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(result, {'name': 'Name', 'password': ' password '});
    },
  );
}

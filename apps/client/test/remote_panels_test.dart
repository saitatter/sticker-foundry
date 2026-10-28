import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/ui/activity_panel.dart';
import 'package:sticker_foundry/ui/common.dart';
import 'package:sticker_foundry/ui/settings_panels.dart';

void main() {
  testWidgets(
    'remote lists load, refresh after mutations and follow a new path',
    (tester) async {
      var count = 0;
      final store = FoundryStore();
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient((request) async {
          count++;
          return http.Response(
            jsonEncode([
              {'name': '${request.url.path}:$count'},
            ]),
            200,
          );
        }),
      );
      Widget panel(String path) => MaterialApp(
        home: Scaffold(
          body: RemoteList(
            store: store,
            path: path,
            item: (row, _) => ListTile(title: Text('${row['name']}')),
          ),
        ),
      );
      await tester.pumpWidget(panel('teams'));
      await tester.pumpAndSettle();
      expect(find.text('/api/teams:1'), findsOneWidget);
      await store.run(() async {});
      await tester.pumpAndSettle();
      expect(find.text('/api/teams:2'), findsOneWidget);
      await tester.pumpWidget(panel('admin/audit-log?limit=25'));
      await tester.pumpAndSettle();
      expect(find.text('/api/admin/audit-log:3'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'activity refresh replaces entries without a Flutter state error',
    (tester) async {
      var count = 0;
      final store = FoundryStore();
      store.api = FoundryApi(
        'http://example.test/api/',
        client: MockClient((_) async {
          count++;
          return http.Response(
            jsonEncode([
              {'action': count == 1 ? 'pack.create' : 'pack.update'},
            ]),
            200,
          );
        }),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ActivityPanel(store: store, packId: 'pack', manage: false),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('pack.create'), findsOneWidget);
      await tester.tap(find.byTooltip('Refresh activity'));
      await tester.pumpAndSettle();
      expect(find.text('pack.update'), findsOneWidget);
      expect(find.text('pack.create'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('instance settings retry recovers from a failed request', (
    tester,
  ) async {
    var count = 0;
    final store = FoundryStore();
    store.api = FoundryApi(
      'http://example.test/api/',
      client: MockClient((_) async {
        count++;
        return count == 1
            ? http.Response('{"message":"Unavailable"}', 503)
            : http.Response('{"instanceName":"Recovered instance"}', 200);
      }),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: InstancePanel(store: store)),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Retry:'));
    await tester.pumpAndSettle();
    expect(find.text('Recovered instance'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

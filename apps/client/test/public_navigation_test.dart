import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sticker_foundry/core/api.dart';
import 'package:sticker_foundry/core/store.dart';
import 'package:sticker_foundry/ui/app.dart';

void main() {
  testWidgets('public pack toolbar and system back return to discovery', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = FoundryStore()..initialized = true;
    store.api = FoundryApi(
      'http://example.test/api/',
      client: MockClient(
        (_) async => http.Response(
          '{"id":"pack","name":"Shared pack","publisher":"Artist","stickers":[]}',
          200,
        ),
      ),
    );
    final router = createFoundryRouter(store, initialLocation: '/share/pack');
    addTearDown(router.dispose);
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    expect(find.text('Shared pack'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.path, '/discover');
    router.go('/share/pack');
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(router.routeInformationProvider.value.uri.path, '/discover');
    expect(tester.takeException(), isNull);
  });
}

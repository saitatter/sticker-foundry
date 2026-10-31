import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sticker_foundry/ui/sticker_grid.dart';

void main() {
  Future<void> grid(
    WidgetTester tester, {
    int count = 3,
    bool editable = true,
    Future<void> Function(List<String>)? drop,
    VoidCallback? add,
  }) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StickerGrid(
            stickers: [
              for (var i = 0; i < count; i++) {'id': '$i'},
            ],
            selected: {},
            editable: editable,
            public: false,
            showSlots: editable,
            tray: const Icon(Icons.collections, key: ValueKey('tray-image')),
            image: (_) => const Center(child: Icon(Icons.face, size: 64)),
            open: (_) => fail('Reorder opened sticker'),
            select: (_, _) {},
            action: (_, _) {},
            drop: drop ?? (_) async {},
            add: add,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'phone layout centers the tray above three numbered columns and empty slots',
    (tester) async {
      var added = false;
      await grid(tester, add: () => added = true);
      final tray = tester.getCenter(find.byKey(const ValueKey('tray-image')));
      final first = tester.getRect(find.byKey(const ValueKey('sticker-0')));
      final second = tester.getRect(find.byKey(const ValueKey('sticker-1')));
      final third = tester.getRect(find.byKey(const ValueKey('sticker-2')));
      expect(tray.dx, closeTo(195, .1));
      expect(tray.dy, lessThan(first.top));
      expect(first.top, second.top);
      expect(second.top, third.top);
      expect(first.right, lessThan(second.left));
      expect(second.right, lessThan(third.left));
      await tester.tap(find.byKey(const ValueKey('empty-slot-3')));
      expect(added, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('holding the sticker image reorders without moving the tray', (
    tester,
  ) async {
    String? moved;
    await grid(
      tester,
      drop: (ids) async {
        moved = ids.join('/');
      },
    );
    final trayBefore = tester.getCenter(
      find.byKey(const ValueKey('tray-image')),
    );
    final source = tester.getCenter(find.byKey(const ValueKey('sticker-2')));
    final target = tester.getCenter(find.byKey(const ValueKey('sticker-0')));
    final gesture = await tester.startGesture(source);
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveTo(target);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 90));
    expect(moved, isNull);
    expect(
      tester.getCenter(find.byKey(const ValueKey('sticker-2'))).dx,
      closeTo(target.dx, .1),
    );
    expect(
      tester.getCenter(find.byKey(const ValueKey('sticker-0'))).dx,
      greaterThan(target.dx),
    );
    await gesture.up();
    await tester.pumpAndSettle();
    expect(moved, '2/0/1');
    expect(
      tester.getCenter(find.byKey(const ValueKey('tray-image'))),
      trayBefore,
    );
  });

  testWidgets(
    'dragging at the bottom scrolls to later rows and stops when cancelled',
    (tester) async {
      await grid(tester, count: 30);
      final gesture = await tester.startGesture(
        tester.getCenter(find.byKey(const ValueKey('sticker-0'))),
      );
      await tester.pump(const Duration(milliseconds: 600));
      await gesture.moveTo(const Offset(195, 820));
      await tester.pump(const Duration(milliseconds: 800));
      final scrollable = tester.state<ScrollableState>(
        find.byType(Scrollable).first,
      );
      expect(scrollable.position.pixels, greaterThan(0));
      await gesture.cancel();
      await tester.pumpAndSettle();
      final stopped = scrollable.position.pixels;
      await tester.pump(const Duration(milliseconds: 400));
      expect(scrollable.position.pixels, stopped);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('viewer grid has no reorder, selection or empty upload slots', (
    tester,
  ) async {
    await grid(tester, editable: false);
    expect(find.byType(Checkbox), findsNothing);
    expect(find.byType(LongPressDraggable<String>), findsNothing);
    expect(find.byKey(const ValueKey('empty-slot-3')), findsNothing);
  });

  testWidgets('cancelled image drag restores the preview without saving', (
    tester,
  ) async {
    var saves = 0;
    await grid(
      tester,
      drop: (_) async {
        saves++;
      },
    );
    final original = tester.getCenter(find.byKey(const ValueKey('sticker-2')));
    final target = tester.getCenter(find.byKey(const ValueKey('sticker-0')));
    final gesture = await tester.startGesture(original);
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveTo(target);
    await tester.pump(const Duration(milliseconds: 200));
    expect(
      tester.getCenter(find.byKey(const ValueKey('sticker-2'))).dx,
      closeTo(target.dx, .1),
    );
    await gesture.cancel();
    await tester.pumpAndSettle();
    expect(saves, 0);
    expect(tester.getCenter(find.byKey(const ValueKey('sticker-2'))), original);
    expect(find.byIcon(Icons.drag_indicator), findsNothing);
    expect(find.byIcon(Icons.pending_outlined), findsNothing);
  });

  testWidgets(
    'preview stays visible until saving finishes, then follows the server order',
    (tester) async {
      final response = Completer<void>();
      var saves = 0;
      await grid(
        tester,
        drop: (_) {
          saves++;
          return response.future;
        },
      );
      final original = tester.getCenter(
        find.byKey(const ValueKey('sticker-2')),
      );
      final target = tester.getCenter(find.byKey(const ValueKey('sticker-0')));
      final gesture = await tester.startGesture(original);
      await tester.pump(const Duration(milliseconds: 600));
      await gesture.moveTo(target);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      await gesture.up();
      await tester.pump();
      expect(saves, 1);
      expect(
        tester.getCenter(find.byKey(const ValueKey('sticker-2'))).dx,
        closeTo(target.dx, .1),
      );
      // A failed save leaves the authoritative input unchanged.
      response.complete();
      await tester.pumpAndSettle();
      expect(
        tester.getCenter(find.byKey(const ValueKey('sticker-2'))),
        original,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'returning to the original slot does not save an unchanged order',
    (tester) async {
      var saves = 0;
      await grid(
        tester,
        drop: (_) async {
          saves++;
        },
      );
      final original = tester.getCenter(
        find.byKey(const ValueKey('sticker-2')),
      );
      final target = tester.getCenter(find.byKey(const ValueKey('sticker-0')));
      final gesture = await tester.startGesture(original);
      await tester.pump(const Duration(milliseconds: 600));
      await gesture.moveTo(target);
      await tester.pump();
      await gesture.moveTo(original);
      await tester.pump();
      await gesture.up();
      await tester.pumpAndSettle();
      expect(saves, 0);
    },
  );
}

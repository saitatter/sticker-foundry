import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/store.dart';
import 'common.dart';

class ActivityPanel extends StatefulWidget {
  final FoundryStore store;
  final String packId;
  final bool manage;
  const ActivityPanel({
    super.key,
    required this.store,
    required this.packId,
    required this.manage,
  });
  @override
  State<ActivityPanel> createState() => _ActivityPanelState();
}

class _ActivityPanelState extends State<ActivityPanel> {
  late Future<dynamic> data;
  int page = 0, size = 10;
  String get path => 'packs/${widget.packId}/activity';
  @override
  void initState() {
    super.initState();
    data = widget.store.api.request(path);
  }

  void reload() => setState(() => data = widget.store.api.request(path));
  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: data,
    builder: (_, snapshot) {
      if (snapshot.hasError) {
        return Center(
          child: TextButton(
            onPressed: reload,
            child: Text('Retry: ${snapshot.error}'),
          ),
        );
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final rows = objects(snapshot.data),
          pages = (rows.length / size).ceil().clamp(1, 100000);
      final current = page.clamp(0, pages - 1);
      return Column(
        children: [
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              DropdownButton<int>(
                value: size,
                items: [10, 25, 50]
                    .map(
                      (v) => DropdownMenuItem(
                        value: v,
                        child: Text('$v per page'),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() {
                  size = v!;
                  page = 0;
                }),
              ),
              action(
                Icons.chevron_left,
                'Previous page',
                current > 0 ? () => setState(() => page = current - 1) : null,
              ),
              Text('Page ${current + 1} of $pages · ${rows.length} entries'),
              action(
                Icons.chevron_right,
                'Next page',
                current + 1 < pages
                    ? () => setState(() => page = current + 1)
                    : null,
              ),
              action(Icons.refresh, 'Refresh activity', reload),
              if (widget.manage)
                TextButton(
                  onPressed: () async {
                    if (await confirm(context, 'Clear activity history?')) {
                      await widget.store.run(() async {
                        await widget.store.api.request(path, method: 'DELETE');
                        reload();
                      });
                    }
                  },
                  child: const Text('Clear history'),
                ),
            ],
          ),
          Expanded(
            child: ListView(
              children: [
                if (rows.isEmpty)
                  const ListTile(title: Text('No activity yet')),
                for (final row in rows.skip(current * size).take(size))
                  ListTile(
                    leading: const Icon(Icons.history),
                    title: Text('${row['action'] ?? row['type']}'),
                    subtitle: SelectionArea(
                      child: Text(
                        '${row['actor']?['displayName'] ?? ''} · ${row['createdAt']}\n${const JsonEncoder.withIndent('  ').convert(row['metadata'] ?? {})}',
                      ),
                    ),
                    trailing: widget.manage
                        ? action(
                            Icons.delete_outline,
                            'Delete entry',
                            () => widget.store.run(() async {
                              await widget.store.api.request(
                                '$path/${row['id']}',
                                method: 'DELETE',
                              );
                              reload();
                            }),
                          )
                        : null,
                  ),
              ],
            ),
          ),
        ],
      );
    },
  );
}

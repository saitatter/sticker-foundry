import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/store.dart';
import 'common.dart';

class SettingsScreen extends StatelessWidget {
  final FoundryStore store;
  const SettingsScreen({super.key, required this.store});
  Future<void> form(
    BuildContext context,
    String title,
    String path,
    Map<String, String> fields, {
    String method = 'POST',
    Json values = const {},
    Map<String, List<String>> choices = const {},
    Set<String> optional = const {},
    Set<String> secrets = const {},
  }) async {
    final d = await formDialog(
      context,
      title,
      fields,
      values: values,
      choices: choices,
      optional: optional,
      secrets: secrets,
    );
    if (d != null) {
      await store.run(
        () => store.api.request(path, method: method, data: d),
        success: 'Saved',
      );
    }
  }

  void page(BuildContext context, String title, Widget body) => Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: Column(
          children: [
            messages(store),
            Expanded(child: body),
          ],
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) =>
      ListenableBuilder(listenable: store, builder: (_, _) => content(context));
  Widget content(BuildContext context) {
    final s = store;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ListTile(
          leading: const Icon(Icons.account_circle_outlined),
          title: Text('${s.user?['displayName']}'),
          subtitle: Text('${s.user?['email']}'),
        ),
        SwitchListTile(
          secondary: const Icon(Icons.dark_mode_outlined),
          title: const Text('Dark theme'),
          value: s.dark,
          onChanged: s.theme,
        ),
        ListTile(
          leading: const Icon(Icons.dns_outlined),
          title: const Text('Server connection'),
          subtitle: Text(s.api.baseUrl),
          onTap: () async {
            final d = await formDialog(
              context,
              'Server connection',
              {'url': 'API URL'},
              values: {'url': s.api.baseUrl},
            );
            if (d != null) await s.run(() => s.server(d['url']));
          },
        ),
        ListTile(
          leading: const Icon(Icons.offline_pin_outlined),
          title: const Text('Offline packs'),
          subtitle: Text('${s.cached.length} downloaded'),
          trailing: Wrap(
            children: [
              action(Icons.sync, 'Sync', () => s.run(s.sync)),
              action(Icons.delete_sweep_outlined, 'Clear downloads', () async {
                if (await confirm(context, 'Clear downloaded packs?')) {
                  await s.run(s.clearCache);
                }
              }),
            ],
          ),
        ),
        ListTile(
          leading: const Icon(Icons.password),
          title: const Text('Change password'),
          onTap: () => form(
            context,
            'Change password',
            'auth/password',
            {
              'currentPassword': 'Current password',
              'newPassword': 'New password',
            },
            method: 'PATCH',
            secrets: {'currentPassword', 'newPassword'},
          ),
        ),
        ListTile(
          leading: const Icon(Icons.devices),
          title: const Text('Active sessions'),
          onTap: () => page(
            context,
            'Sessions',
            RemoteList(
              store: s,
              path: 'auth/sessions',
              actions: [
                TextButton(
                  onPressed: () => s.run(() async {
                    await s.api.request('auth/sessions', method: 'DELETE');
                    await s.signOut();
                  }),
                  child: const Text('Revoke all sessions'),
                ),
              ],
              item: (row, reload) => ListTile(
                title: Text('${row['userAgent'] ?? 'Device'}'),
                subtitle: Text(
                  '${row['ipAddress'] ?? ''}\n${row['createdAt']}',
                ),
                trailing: action(
                  Icons.logout,
                  'Revoke session',
                  () => s.run(() async {
                    await s.api.request(
                      'auth/sessions/${row['id']}',
                      method: 'DELETE',
                    );
                    reload();
                  }),
                ),
              ),
            ),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.group_work_outlined),
          title: const Text('Teams'),
          subtitle: Text('${s.teams.length} teams'),
          onTap: () => page(context, 'Teams', teams(context)),
        ),
        ListTile(
          leading: const Icon(Icons.mail_outline),
          title: const Text('Accept pack invite'),
          onTap: () async {
            final d = await formDialog(context, 'Accept invite', {
              'code': 'Invite code',
            });
            if (d != null) {
              await s.run(() async {
                await s.api.request(
                  'packs/invites/${Uri.encodeComponent(d['code'])}/accept',
                  method: 'POST',
                );
                await s.refresh();
              }, success: 'Invite accepted');
            }
          },
        ),
        if (s.admin) ...[
          const Divider(),
          ListTile(
            leading: const Icon(Icons.admin_panel_settings_outlined),
            title: const Text('Instance administration'),
            onTap: () => admin(context),
          ),
          ListTile(
            leading: const Icon(Icons.policy_outlined),
            title: const Text('Audit log'),
            onTap: () => page(
              context,
              'Audit log',
              RemoteList(
                store: s,
                path: 'admin/audit-log?limit=100',
                actions: [
                  TextButton(
                    onPressed: () => s.run(() async {
                      final bytes = await s.api.request(
                        'admin/audit-log/export',
                        raw: true,
                      ) as Uint8List;
                      await download(bytes, 'audit-log.csv');
                    }),
                    child: const Text('Export'),
                  ),
                  TextButton(
                    onPressed: () async {
                      if (await confirm(
                        context,
                        'Apply audit retention cleanup?',
                      )) {
                        await s.run(
                          () => s.api.request(
                            'admin/audit-log/cleanup',
                            method: 'POST',
                          ),
                          success: 'Audit cleanup complete',
                        );
                      }
                    },
                    child: const Text('Apply retention'),
                  ),
                ],
                item: (row, _) => ListTile(
                  title: Text('${row['action']}'),
                  subtitle: SelectableText(
                    '${row['createdAt']} · ${row['actorEmail'] ?? row['userId'] ?? ''}\n${jsonEncode(row['metadata'] ?? row['details'] ?? {})}',
                  ),
                ),
              ),
            ),
          ),
        ],
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: () => s.run(s.signOut),
        ),
      ],
    );
  }

  Widget teams(BuildContext context) => RemoteList(
    store: store,
    path: 'teams',
    actions: [
      TextButton.icon(
        icon: const Icon(Icons.add),
        label: const Text('Create team'),
        onPressed: () => form(
          context,
          'Create team',
          'teams',
          {'name': 'Team name', 'description': 'Description'},
          optional: {'description'},
        ),
      ),
    ],
    item: (team, reload) => ListTile(
      title: Text('${team['name']}'),
      subtitle: Text(
        '${team['memberCount']} members · ${team['packCount']} packs',
      ),
      onTap: () => page(
        context,
        '${team['name']}',
        RemoteList(
          store: store,
          path: 'teams/${team['id']}/members',
          actions: [
            if (team['canManage'] == true)
              TextButton.icon(
                icon: const Icon(Icons.person_add),
                label: const Text('Add member'),
                onPressed: () => form(
                  context,
                  'Add team member',
                  'teams/${team['id']}/members',
                  {'email': 'Email'},
                  choices: {
                    'role': ['EDITOR', 'VIEWER'],
                  },
                ),
              ),
          ],
          item: (row, refresh) => ListTile(
            title: Text('${object(row['user'])['displayName']}'),
            subtitle: Text('${object(row['user'])['email']} · ${row['role']}'),
            trailing: team['canManage'] == true && row['role'] != 'OWNER'
                ? PopupMenuButton<String>(
                    onSelected: (v) => store.run(() async {
                      await store.api.request(
                        'teams/${team['id']}/members/${row['id']}',
                        method: v == 'REMOVE' ? 'DELETE' : 'PATCH',
                        data: v == 'REMOVE' ? null : {'role': v},
                      );
                      refresh();
                    }),
                    itemBuilder: (_) => ['EDITOR', 'VIEWER', 'REMOVE']
                        .map((v) => PopupMenuItem(value: v, child: Text(v)))
                        .toList(),
                  )
                : null,
          ),
        ),
      ),
    ),
  );
  Future<void> admin(BuildContext context) async {
    await store.run(() async {
      final value = object(await store.api.request('admin/settings'));
      if (!context.mounted) return;
      final d = await formDialog(
        context,
        'Instance settings',
        {
          'instanceName': 'Instance name',
          'instanceDescription': 'Description',
          'registrationInviteCode': 'Registration invite code',
          'storageQuotaBytes': 'Storage quota in bytes (empty = unlimited)',
          'auditRetentionDays': 'Audit retention days (empty = unlimited)',
        },
        values: value,
        optional: {
          'instanceDescription',
          'registrationInviteCode',
          'storageQuotaBytes',
          'auditRetentionDays',
        },
        choices: {
          'registrationMode': ['open', 'invite-only', 'disabled'],
        },
      );
      if (d == null) return;
      for (final k in ['storageQuotaBytes', 'auditRetentionDays']) {
        d[k] = (d[k] as String).isEmpty ? null : int.parse(d[k]);
      }
      await store.api.request('admin/settings', method: 'PATCH', data: d);
      store.instanceName = d['instanceName'];
      store.notice =
          'Instance settings saved. Background removal: ${value['backgroundRemoval']}';
    });
  }
}

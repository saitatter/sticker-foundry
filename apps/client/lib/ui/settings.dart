import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'settings_panels.dart';
export 'settings_panels.dart' show TeamScreen;

import '../core/api.dart';
import '../core/store.dart';
import 'common.dart';

class SettingsScreen extends StatelessWidget {
  final FoundryStore store;
  final String section;
  const SettingsScreen({
    super.key,
    required this.store,
    this.section = 'account',
  });
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
      await store.run(() async {
        await store.api.request(path, method: method, data: d);
        if (path == 'auth/password') await store.signOut();
        if (path == 'teams') await store.refresh();
      }, success: 'Saved');
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
    if (section != 'account') {
      final panel = switch (section) {
        'security' => SecurityPanel(store: s),
        'instance' || 'admin' => InstancePanel(store: s),
        'processing' => InstancePanel(store: s, processing: true),
        'audit' => AuditPanel(store: s),
        'teams' => teams(context),
        _ => const Center(child: Text('Settings section not found')),
      };
      return Column(
        children: [
          ListTile(
            leading: action(
              Icons.arrow_back,
              'Account settings',
              () => context.go('/app/settings/account'),
            ),
            title: Text(
              section == 'admin'
                  ? 'Instance administration'
                  : '${section[0].toUpperCase()}${section.substring(1)}',
            ),
          ),
          Expanded(child: panel),
        ],
      );
    }
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
          onTap: () => context.go('/app/settings/security'),
        ),
        ListTile(
          leading: const Icon(Icons.group_work_outlined),
          title: const Text('Teams'),
          subtitle: Text(
            '${s.teams.length} ${s.teams.length == 1 ? 'team' : 'teams'}',
          ),
          onTap: () => context.go('/app/settings/teams'),
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
            onTap: () => context.go('/app/settings/instance'),
          ),
          ListTile(
            leading: const Icon(Icons.memory),
            title: const Text('Processing status'),
            onTap: () => context.go('/app/settings/processing'),
          ),
          ListTile(
            leading: const Icon(Icons.policy_outlined),
            title: const Text('Audit log'),
            onTap: () => context.go('/app/settings/audit'),
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
        '${team['memberCount']} ${team['memberCount'] == 1 ? 'member' : 'members'} · ${team['packCount']} ${team['packCount'] == 1 ? 'pack' : 'packs'}',
      ),
      onTap: () => context.go('/app/teams/${team['id']}'),
    ),
  );
}

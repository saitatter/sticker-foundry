import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/store.dart';
import 'common.dart';

class SecurityPanel extends StatelessWidget {
  final FoundryStore store;
  const SecurityPanel({super.key, required this.store});
  @override
  Widget build(BuildContext context) => RemoteList(
    store: store,
    path: 'auth/sessions',
    actions: [
      TextButton.icon(
        icon: const Icon(Icons.password),
        label: const Text('Change password'),
        onPressed: () async {
          final data = await formDialog(
            context,
            'Change password',
            {
              'currentPassword': 'Current password',
              'newPassword': 'New password',
            },
            secrets: {'currentPassword', 'newPassword'},
          );
          if (data != null) {
            await store.run(
              () => store.api.request(
                'auth/password',
                method: 'PATCH',
                data: data,
              ),
              success: 'Password changed',
            );
          }
        },
      ),
      TextButton(
        onPressed: () async {
          if (await confirm(context, 'Sign out all devices?')) {
            await store.run(() async {
              await store.api.request('auth/sessions', method: 'DELETE');
              await store.signOut();
            });
          }
        },
        child: const Text('Revoke all sessions'),
      ),
    ],
    item: (row, reload) => ListTile(
      leading: const Icon(Icons.devices),
      title: Text('${row['userAgent'] ?? 'Device'}'),
      subtitle: Text(
        '${row['ipAddress'] ?? ''}\nCreated ${row['createdAt']}\nExpires ${row['expiresAt'] ?? '—'}',
      ),
      trailing: action(
        Icons.logout,
        'Revoke session',
        () => store.run(() async {
          await store.api.request(
            'auth/sessions/${row['id']}',
            method: 'DELETE',
          );
          reload();
        }),
      ),
    ),
  );
}

class AuditPanel extends StatefulWidget {
  final FoundryStore store;
  const AuditPanel({super.key, required this.store});
  @override
  State<AuditPanel> createState() => _AuditPanelState();
}

class _AuditPanelState extends State<AuditPanel> {
  int limit = 100;
  @override
  Widget build(BuildContext context) => !widget.store.admin
      ? const Center(child: Text('Administrator access required'))
      : RemoteList(
          key: ValueKey(limit),
          store: widget.store,
          path: 'admin/audit-log?limit=$limit',
          actions: [
            TextButton.icon(
              icon: const Icon(Icons.download),
              label: const Text('Export CSV'),
              onPressed: () => widget.store.run(() async {
                final bytes = await widget.store.api.request(
                  'admin/audit-log/export?limit=1000',
                  raw: true,
                ) as Uint8List;
                await download(bytes, 'audit-log.csv');
              }),
            ),
            TextButton(
              onPressed: () async {
                if (await confirm(context, 'Apply audit retention cleanup?')) {
                  await widget.store.run(
                    () => widget.store.api.request(
                      'admin/audit-log/cleanup',
                      method: 'POST',
                    ),
                    success: 'Audit cleanup complete',
                  );
                }
              },
              child: const Text('Apply retention'),
            ),
            DropdownButton<int>(
              value: limit,
              items: [25, 50, 100, 200, 500, 1000]
                  .map(
                    (v) =>
                        DropdownMenuItem(value: v, child: Text('$v entries')),
                  )
                  .toList(),
              onChanged: (v) => setState(() => limit = v!),
            ),
          ],
          item: (row, _) => ListTile(
            title: Text('${row['action']}'),
            subtitle: SelectionArea(
              child: Text(
                '${row['createdAt']} · ${row['actor']?['displayName'] ?? row['actorEmail'] ?? row['userId'] ?? ''}\n${const JsonEncoder.withIndent('  ').convert(row['metadata'] ?? {})}',
              ),
            ),
          ),
        );
}

class InstancePanel extends StatefulWidget {
  final FoundryStore store;
  final bool processing;
  const InstancePanel({
    super.key,
    required this.store,
    this.processing = false,
  });
  @override
  State<InstancePanel> createState() => _InstancePanelState();
}

class _InstancePanelState extends State<InstancePanel> {
  late Future<dynamic> request;
  final form = GlobalKey<FormState>();
  final draft = <String, String>{};
  String? mode;
  @override
  void initState() {
    super.initState();
    request = widget.store.api.request(
      widget.store.admin ? 'admin/settings' : 'instance',
      auth: widget.store.admin,
    );
  }

  Future<void> save(Json settings) async {
    if (!form.currentState!.validate()) return;
    final value = {...settings, ...draft};
    await widget.store.run(() async {
      final data = <String, dynamic>{
        for (final k in [
          'instanceName',
          'instanceDescription',
          'registrationInviteCode',
        ])
          k: value[k] ?? '',
        'registrationMode': mode ?? value['registrationMode'],
      };
      for (final key in ['storageQuotaBytes', 'auditRetentionDays']) {
        final text = '${value[key] ?? ''}'.trim();
        data[key] = text.isEmpty ? null : int.parse(text);
      }
      await widget.store.api.request(
        'admin/settings',
        method: 'PATCH',
        data: data,
      );
      widget.store.instanceName = data['instanceName'];
    }, success: 'Instance settings saved');
  }

  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: request,
    builder: (_, snapshot) {
      if (snapshot.hasError) {
        return Center(
          child: TextButton(
            onPressed: () => setState(() {
              request = widget.store.api.request(
                widget.store.admin ? 'admin/settings' : 'instance',
                auth: widget.store.admin,
              );
            }),
            child: Text('Retry: ${snapshot.error}'),
          ),
        );
      }
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final value = object(snapshot.data);
      if (!widget.store.admin) {
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              '${value['instanceName']}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Text('${value['instanceDescription'] ?? ''}'),
            if (widget.processing)
              const Text(
                'An administrator can inspect processing capabilities.',
              ),
          ],
        );
      }
      final status = object(value['backgroundRemoval'] ?? {});
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: Form(
            key: form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!widget.processing) ...[
                  for (final field in const {
                    'instanceName': 'Instance name',
                    'instanceDescription': 'Description',
                    'registrationInviteCode': 'Registration invite code',
                    'storageQuotaBytes':
                        'Storage quota in bytes (empty = unlimited)',
                    'auditRetentionDays':
                        'Audit retention days (empty = unlimited)',
                  }.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: TextFormField(
                        initialValue: '${value[field.key] ?? ''}',
                        decoration: InputDecoration(labelText: field.value),
                        onChanged: (v) => draft[field.key] = v,
                        validator: (v) {
                          if (field.key == 'instanceName' &&
                              (v?.trim().isEmpty ?? true)) {
                            return 'Required';
                          }
                          if ([
                                'storageQuotaBytes',
                                'auditRetentionDays',
                              ].contains(field.key) &&
                              v!.trim().isNotEmpty &&
                              (int.tryParse(v) == null ||
                                  int.parse(v) < 1 ||
                                  int.parse(v) >
                                      (field.key == 'auditRetentionDays'
                                          ? 3650
                                          : 10995116277760))) {
                            return field.key == 'auditRetentionDays'
                                ? 'Enter 1?3650 days, or leave empty'
                                : 'Enter a positive quota up to 10 TiB, or leave empty';
                          }
                          return null;
                        },
                      ),
                    ),
                  DropdownButtonFormField<String>(
                    initialValue: value['registrationMode'],
                    decoration: const InputDecoration(
                      labelText: 'Registration policy',
                    ),
                    items: ['open', 'invite-only', 'disabled']
                        .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                        .toList(),
                    onChanged: (v) => mode = v,
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: widget.store.busy ? null : () => save(value),
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Save settings'),
                  ),
                  const Divider(height: 32),
                ],
                Text(
                  'Background removal',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    status['thresholdAvailable'] == true
                        ? Icons.check_circle_outline
                        : Icons.error_outline,
                  ),
                  title: const Text('Threshold processing'),
                  subtitle: Text(
                    status['thresholdAvailable'] == true
                        ? 'Available'
                        : 'Unavailable',
                  ),
                ),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    status['aiCommandConfigured'] == true
                        ? Icons.check_circle_outline
                        : Icons.info_outline,
                  ),
                  title: const Text('AI background removal'),
                  subtitle: Text(
                    status['aiCommandConfigured'] == true
                        ? 'Configured · fallback: ${status['fallbackMode'] ?? 'threshold'}'
                        : 'Not configured · threshold processing is available as fallback',
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class TeamScreen extends StatefulWidget {
  final FoundryStore store;
  final String id;
  const TeamScreen({super.key, required this.store, required this.id});
  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  late Future<dynamic> request;
  @override
  void initState() {
    super.initState();
    request = widget.store.api.request('teams');
  }

  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: request,
    builder: (_, snapshot) {
      if (snapshot.hasError) return Center(child: Text('${snapshot.error}'));
      if (!snapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      final matches = objects(snapshot.data).where((t) => t['id'] == widget.id);
      if (matches.isEmpty) {
        return const Center(child: Text('Team not found or access revoked'));
      }
      final team = matches.first;
      return Column(
        children: [
          ListTile(
            leading: action(
              Icons.arrow_back,
              'Settings',
              () => context.go('/app/settings/account'),
            ),
            title: Text('${team['name']}'),
            subtitle: Text('${team['description'] ?? ''}'),
          ),
          Expanded(
            child: RemoteList(
              store: widget.store,
              path: 'teams/${widget.id}/members',
              actions: [
                if (team['canManage'] == true)
                  TextButton.icon(
                    icon: const Icon(Icons.person_add),
                    label: const Text('Add member'),
                    onPressed: () async {
                      final data = await formDialog(
                        context,
                        'Add team member',
                        {'email': 'Email'},
                        choices: {
                          'role': ['EDITOR', 'VIEWER'],
                        },
                      );
                      if (data != null) {
                        await widget.store.run(
                          () => widget.store.api.request(
                            'teams/${widget.id}/members',
                            method: 'POST',
                            data: data,
                          ),
                        );
                      }
                    },
                  ),
              ],
              item: (member, reload) => ListTile(
                title: Text('${member['user']['displayName']}'),
                subtitle: Text(
                  '${member['user']['email']} · ${member['role']}',
                ),
                trailing: team['canManage'] == true && member['role'] != 'OWNER'
                    ? PopupMenuButton<String>(
                        tooltip: 'Member actions',
                        itemBuilder: (_) => ['EDITOR', 'VIEWER', 'REMOVE']
                            .map(
                              (v) => PopupMenuItem(
                                value: v,
                                child: Text(fieldLabel(v)),
                              ),
                            )
                            .toList(),
                        onSelected: (v) => widget.store.run(() async {
                          await widget.store.api.request(
                            'teams/${widget.id}/members/${member['id']}',
                            method: v == 'REMOVE' ? 'DELETE' : 'PATCH',
                            data: v == 'REMOVE' ? null : {'role': v},
                          );
                          reload();
                        }),
                      )
                    : null,
              ),
            ),
          ),
        ],
      );
    },
  );
}

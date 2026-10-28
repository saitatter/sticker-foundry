import 'dart:convert';

import 'package:flutter/material.dart';

import '../core/api.dart';

class ActivityEntry extends StatelessWidget {
  final Json entry;
  final VoidCallback? onDelete;
  const ActivityEntry({super.key, required this.entry, this.onDelete});

  static const titles = {
    'pack.create': 'Pack created',
    'pack.update': 'Pack settings updated',
    'pack.delete': 'Pack deleted',
    'pack.clone': 'Pack cloned',
    'pack.tray.update': 'Pack icon updated',
    'pack.invite.create': 'Invitation created',
    'pack.invite.accept': 'Invitation accepted',
    'pack.invite.revoke': 'Invitation revoked',
    'pack.member.update': 'Member role changed',
    'pack.member.remove': 'Member removed',
    'sticker.upload': 'Sticker uploaded',
    'sticker.update': 'Sticker updated',
    'sticker.replace': 'Sticker image replaced',
    'stickers.reorder': 'Sticker order changed',
    'stickers.copy': 'Stickers copied',
    'stickers.move': 'Stickers moved',
    'sticker.delete': 'Sticker deleted',
    'sticker.comment.create': 'Comment added',
    'sticker.comment.delete': 'Comment deleted',
    'team.create': 'Team created',
    'team.member.add': 'Team member added',
    'team.member.update': 'Team member role changed',
    'team.member.remove': 'Team member removed',
    'admin.settings.update': 'Instance settings updated',
    'auth.register': 'Account created',
    'auth.login': 'Signed in',
    'auth.password.change': 'Password changed',
    'auth.passwordReset.request': 'Password reset requested',
    'auth.passwordReset.complete': 'Password reset completed',
  };

  String get timestamp {
    final value = '${entry['createdAt'] ?? ''}';
    final date = DateTime.tryParse(value)?.toLocal();
    if (date == null) return value;
    String two(int value) => '$value'.padLeft(2, '0');
    return '${date.year}-${two(date.month)}-${two(date.day)} ${two(date.hour)}:${two(date.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final action = '${entry['action'] ?? entry['type'] ?? 'Activity'}';
    final actor =
        '${entry['actor']?['displayName'] ?? entry['actorEmail'] ?? ''}';
    return ExpansionTile(
      leading: const Icon(Icons.history),
      dense: true,
      title: Text(titles[action] ?? action.replaceAll('.', ' ')),
      subtitle: Text(
        [actor, timestamp].where((value) => value.isNotEmpty).join(' · '),
      ),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      expandedCrossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SelectionArea(
          child: Text(
            const JsonEncoder.withIndent('  ').convert(entry['metadata'] ?? {}),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
        if (onDelete != null)
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              tooltip: 'Delete entry',
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline),
            ),
          ),
      ],
    );
  }
}

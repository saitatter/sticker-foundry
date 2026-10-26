import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/store.dart';
import 'common.dart';
import 'pack.dart';
import 'settings.dart';

class FoundryApp extends StatefulWidget {
  final FoundryStore store;
  const FoundryApp({super.key, required this.store});
  @override
  State<FoundryApp> createState() => _FoundryAppState();
}

class _FoundryAppState extends State<FoundryApp> {
  late final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => Home(store: widget.store),
      ),
      GoRoute(path: '/app', redirect: (_, _) => '/'),
      GoRoute(
        path: '/packs/:id',
        builder: (_, s) =>
            PackScreen(store: widget.store, id: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/app/packs/:id/:tab',
        builder: (_, s) =>
            PackScreen(store: widget.store, id: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/share/:id',
        builder: (_, s) => PackScreen(
          store: widget.store,
          id: s.pathParameters['id']!,
          public: true,
        ),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (_, s) => ResetScreen(
          store: widget.store,
          token: s.uri.queryParameters['token'] ?? '',
        ),
      ),
    ],
  );
  @override
  void initState() {
    super.initState();
    widget.store.initialize();
  }

  ThemeData theme(Brightness b) => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xff6551cf),
      brightness: b,
    ),
    visualDensity: VisualDensity.compact,
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
      isDense: true,
    ),
    cardTheme: const CardThemeData(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
    ),
  );
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.store,
    builder: (_, _) => MaterialApp.router(
      title: 'Sticker Foundry',
      debugShowCheckedModeBanner: false,
      theme: theme(Brightness.light),
      darkTheme: theme(Brightness.dark),
      themeMode: widget.store.dark ? ThemeMode.dark : ThemeMode.light,
      routerConfig: router,
      builder: (_, child) => widget.store.initialized
          ? Stack(
              children: [
                child!,
                if (widget.store.busy)
                  const Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: LinearProgressIndicator(),
                  ),
              ],
            )
          : const Scaffold(body: Center(child: CircularProgressIndicator())),
    ),
  );
}

class Home extends StatefulWidget {
  final FoundryStore store;
  const Home({super.key, required this.store});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  FoundryStore get s => widget.store;
  int tab = 0;
  String query = '', filter = 'All', sort = 'Recent';
  Future<void> discover() => s.run(() async {
    s.publicPacks = objects(await s.api.request('public/packs', auth: false));
  });
  void select(int v) {
    setState(() => tab = v);
    if (v == 1) discover();
  }

  Future<void> create() async {
    final data = await formDialog(
      context,
      'Create pack',
      {'name': 'Name', 'publisher': 'Publisher', 'description': 'Description'},
      optional: {'description'},
      flags: ['isPublic', 'requiresApproval', 'isAnimated'],
      choices: {
        if (s.teams.isNotEmpty)
          'teamId': ['', ...s.teams.map((t) => t['id'] as String)],
      },
    );
    if (data == null) return;
    if (data['teamId'] == '') data.remove('teamId');
    await s.run(() async {
      final p = object(
        await s.api.request('packs', method: 'POST', data: data),
      );
      await s.refresh();
      if (mounted) context.push('/packs/${p['id']}');
    });
  }

  @override
  Widget build(BuildContext context) =>
      ListenableBuilder(listenable: s, builder: (_, _) => content(context));
  Widget content(BuildContext context) {
    if (s.user == null && tab != 1) {
      return AuthScreen(store: s, browse: () => select(1));
    }
    final wide = MediaQuery.sizeOf(context).width >= 850;
    const destinations = [
      NavigationDestination(
        icon: Icon(Icons.collections_outlined),
        label: 'Library',
      ),
      NavigationDestination(
        icon: Icon(Icons.explore_outlined),
        label: 'Discover',
      ),
      NavigationDestination(icon: Icon(Icons.tune), label: 'Settings'),
    ];
    final content = tab == 2
        ? SettingsScreen(store: s)
        : Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        decoration: const InputDecoration(
                          hintText: 'Search packs',
                          prefixIcon: Icon(Icons.search),
                        ),
                        onChanged: (v) => setState(() => query = v),
                      ),
                    ),
                    PopupMenuButton<String>(
                      tooltip: 'Filter',
                      icon: const Icon(Icons.filter_list),
                      onSelected: (v) => setState(() => filter = v),
                      itemBuilder: (_) =>
                          ['All', 'Static', 'Animated', 'Public', 'Private']
                              .map(
                                (v) => CheckedPopupMenuItem(
                                  value: v,
                                  checked: filter == v,
                                  child: Text(v),
                                ),
                              )
                              .toList(),
                    ),
                    PopupMenuButton<String>(
                      tooltip: 'Sort',
                      icon: const Icon(Icons.sort),
                      onSelected: (v) => setState(() => sort = v),
                      itemBuilder: (_) => ['Recent', 'Name', 'Sticker count']
                          .map(
                            (v) => CheckedPopupMenuItem(
                              value: v,
                              checked: sort == v,
                              child: Text(v),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Builder(
                  builder: (_) {
                    final rows = (tab == 1 ? s.publicPacks : s.library)
                        .where(
                          (p) =>
                              '${p['name']} ${p['publisher']} ${p['description']}'
                                  .toLowerCase()
                                  .contains(query.toLowerCase()) &&
                              (filter == 'All' ||
                                  filter == 'Animated' &&
                                      p['isAnimated'] == true ||
                                  filter == 'Static' &&
                                      p['isAnimated'] != true ||
                                  filter == 'Public' && p['isPublic'] == true ||
                                  filter == 'Private' && p['isPublic'] != true),
                        )
                        .toList();
                    rows.sort(
                      (a, b) => sort == 'Name'
                          ? '${a['name']}'.compareTo('${b['name']}')
                          : sort == 'Sticker count'
                          ? ((b['stickerCount'] ?? 0) as num).compareTo(
                              (a['stickerCount'] ?? 0) as num,
                            )
                          : '${b['updatedAt']}'.compareTo('${a['updatedAt']}'),
                    );
                    if (rows.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.auto_awesome_outlined, size: 48),
                            const SizedBox(height: 12),
                            Text(
                              query.isEmpty
                                  ? 'Your next sticker pack starts here'
                                  : 'No matching packs',
                            ),
                            if (tab == 0)
                              TextButton.icon(
                                onPressed: s.offline ? null : create,
                                icon: const Icon(Icons.add),
                                label: const Text('Create pack'),
                              ),
                          ],
                        ),
                      );
                    }
                    return RefreshIndicator(
                      onRefresh: tab == 1 ? discover : () => s.run(s.refresh),
                      child: GridView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 90),
                        gridDelegate:
                            const SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 330,
                              mainAxisExtent: 145,
                              crossAxisSpacing: 12,
                              mainAxisSpacing: 12,
                            ),
                        itemCount: rows.length,
                        itemBuilder: (_, i) {
                          final p = rows[i];
                          return Card(
                            child: InkWell(
                              onTap: () => context.push(
                                '/${tab == 1 ? 'share' : 'packs'}/${p['id']}',
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        SizedBox(
                                          width: 40,
                                          height: 40,
                                          child: FutureBuilder(
                                            future: s.cover(
                                              p,
                                              public: tab == 1,
                                            ),
                                            builder: (_, image) => image.hasData
                                                ? Image.memory(
                                                    image.data!,
                                                    fit: BoxFit.contain,
                                                    errorBuilder: (_, _, _) =>
                                                        const Icon(
                                                          Icons.auto_awesome,
                                                        ),
                                                  )
                                                : Icon(
                                                    p['isAnimated'] == true
                                                        ? Icons.gif_box_outlined
                                                        : Icons.auto_awesome,
                                                    color: Theme.of(context)
                                                        .colorScheme
                                                        .primary,
                                                  ),
                                          ),
                                        ),
                                        const Spacer(),
                                        if (s.cached.containsKey(p['id']))
                                          const Tooltip(
                                            message: 'Available offline',
                                            child: Icon(
                                              Icons.offline_pin_outlined,
                                              size: 18,
                                            ),
                                          ),
                                        const SizedBox(width: 8),
                                        Icon(
                                          p['isPublic'] == true
                                              ? Icons.public
                                              : Icons.lock_outline,
                                          size: 18,
                                        ),
                                      ],
                                    ),
                                    const Spacer(),
                                    Text(
                                      '${p['name']}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${p['publisher']} · ${p['stickerCount'] ?? (p['stickers'] as List?)?.length ?? 0} stickers',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    );
                  },
                ),
              ),
            ],
          );
    return Scaffold(
      appBar: AppBar(
        title: Text(
          tab == 0
              ? 'Your library'
              : tab == 1
              ? 'Discover'
              : s.instanceName,
        ),
        actions: [
          if (s.user != null && tab != 2)
            action(
              Icons.sync,
              'Download packs for offline use',
              s.busy || s.offline
                  ? null
                  : () => s.run(s.sync, success: 'Packs are available offline'),
            ),
          if (s.user == null)
            TextButton(
              onPressed: () => select(0),
              child: const Text('Sign in'),
            ),
        ],
      ),
      body: Column(
        children: [
          messages(s),
          Expanded(
            child: Row(
              children: [
                if (wide)
                  NavigationRail(
                    selectedIndex: tab,
                    onDestinationSelected: select,
                    labelType: NavigationRailLabelType.all,
                    destinations: destinations
                        .map(
                          (d) => NavigationRailDestination(
                            icon: d.icon,
                            label: Text(d.label),
                          ),
                        )
                        .toList(),
                  ),
                Expanded(child: content),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: tab,
              onDestinationSelected: select,
              destinations: destinations,
            ),
      floatingActionButton: tab == 0
          ? FloatingActionButton(
              onPressed: s.offline || s.busy ? null : create,
              tooltip: 'Create pack',
              child: const Icon(Icons.add),
            )
          : null,
    );
  }
}

class AuthScreen extends StatefulWidget {
  final FoundryStore store;
  final VoidCallback browse;
  const AuthScreen({super.key, required this.store, required this.browse});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController(),
      invite = TextEditingController();
  bool register = false, visible = false;
  @override
  void dispose() {
    for (final c in [email, password, name, invite]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.store;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 450),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    Icons.auto_awesome,
                    size: 52,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    s.instanceName,
                    style: Theme.of(context).textTheme.headlineMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Make something worth sharing.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 28),
                  messages(s),
                  if (register)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: TextField(
                        controller: name,
                        decoration: const InputDecoration(
                          labelText: 'Display name',
                        ),
                      ),
                    ),
                  TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.username],
                    decoration: const InputDecoration(labelText: 'Email'),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: password,
                    obscureText: !visible,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Password',
                      suffixIcon: action(
                        visible ? Icons.visibility_off : Icons.visibility,
                        'Show password',
                        () => setState(() => visible = !visible),
                      ),
                    ),
                  ),
                  if (register)
                    Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: TextField(
                        controller: invite,
                        decoration: const InputDecoration(
                          labelText: 'Registration invite code (optional)',
                        ),
                      ),
                    ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: s.busy
                        ? null
                        : () => s.run(
                            () => s.authenticate(
                              email.text,
                              password.text,
                              name: register ? name.text : null,
                              invite: invite.text,
                            ),
                          ),
                    child: Text(register ? 'Create account' : 'Sign in'),
                  ),
                  TextButton(
                    onPressed: () => setState(() => register = !register),
                    child: Text(
                      register
                          ? 'Already have an account? Sign in'
                          : 'Create an account',
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      final d = await formDialog(
                        context,
                        'Reset password',
                        {'email': 'Email'},
                        values: {'email': email.text},
                      );
                      if (d != null) {
                        await s.run(
                          () => s.api.request(
                            'auth/password/reset/request',
                            method: 'POST',
                            auth: false,
                            data: d,
                          ),
                          success: 'If the account exists, reset instructions have been sent.',
                        );
                      }
                    },
                    child: const Text('Forgot password?'),
                  ),
                  OutlinedButton(
                    onPressed: widget.browse,
                    child: const Text('Explore public packs'),
                  ),
                  TextButton.icon(
                    icon: const Icon(Icons.dns_outlined),
                    label: const Text('Server connection'),
                    onPressed: () async {
                      final d = await formDialog(
                        context,
                        'Server connection',
                        {'url': 'API server URL'},
                        values: {'url': s.api.baseUrl},
                      );
                      if (d != null) await s.run(() => s.server(d['url']));
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ResetScreen extends StatelessWidget {
  final FoundryStore store;
  final String token;
  const ResetScreen({super.key, required this.store, required this.token});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Reset password')),
    body: Center(
      child: FilledButton(
        onPressed: () async {
          final d = await formDialog(
            context,
            'New password',
            {'newPassword': 'New password'},
            secrets: {'newPassword'},
          );
          if (d != null) {
            await store.run(() async {
              await store.api.request(
                'auth/password/reset/confirm',
                method: 'POST',
                auth: false,
                data: {...d, 'token': token},
              );
              if (context.mounted) context.go('/');
            }, success: 'Password reset. Sign in with your new password.');
          }
        },
        child: const Text('Choose new password'),
      ),
    ),
  );
}

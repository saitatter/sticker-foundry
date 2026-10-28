import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/store.dart';
import 'common.dart';
import 'pack.dart';
import 'settings.dart';

GoRouter createFoundryRouter(FoundryStore store, {String? initialLocation}) {
  return GoRouter(
    initialLocation: initialLocation,
    refreshListenable: store,
    redirect: (_, state) {
      if (!store.initialized) return null;
      final path = state.uri.path;
      if (path == '/') return store.user == null ? '/login' : '/app/packs';
      final protected = path == '/app' || path.startsWith('/app/');
      if (protected && store.user == null) {
        return Uri(
          path: '/login',
          queryParameters: {'next': state.uri.toString()},
        ).toString();
      }
      if (path == '/login' && store.user != null) {
        final next = Uri.tryParse(state.uri.queryParameters['next'] ?? '');
        return next != null &&
                !next.hasScheme &&
                next.host.isEmpty &&
                (next.path.startsWith('/app/') ||
                    next.path.startsWith('/share/'))
            ? next.toString()
            : '/app/packs';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/',
        builder: (_, _) => Home(store: store),
      ),
      GoRoute(
        path: '/login',
        builder: (_, _) => Home(store: store),
      ),
      GoRoute(
        path: '/app/packs',
        builder: (_, state) =>
            Home(store: store, parameters: state.uri.queryParameters),
        routes: [
          GoRoute(
            path: ':id/:tab',
            builder: (_, state) => PackScreen(
              store: store,
              id: state.pathParameters['id']!,
              section: state.pathParameters['tab']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/discover',
        builder: (_, state) => Home(
          store: store,
          initialTab: 1,
          parameters: state.uri.queryParameters,
        ),
      ),
      GoRoute(
        path: '/app/settings/:section',
        builder: (_, state) => Home(
          store: store,
          initialTab: 2,
          settingsSection: state.pathParameters['section']!,
        ),
      ),
      GoRoute(
        path: '/app/teams/:id',
        builder: (_, state) => Home(
          store: store,
          initialTab: 2,
          teamId: state.pathParameters['id'],
        ),
      ),
      GoRoute(
        path: '/share/:id',
        builder: (_, state) => PackScreen(
          store: store,
          id: state.pathParameters['id']!,
          public: true,
        ),
      ),
      GoRoute(
        path: '/reset-password',
        builder: (_, state) => ResetScreen(
          store: store,
          token: state.uri.queryParameters['token'] ?? '',
        ),
      ),
    ],
  );
}

class FoundryApp extends StatefulWidget {
  final FoundryStore store;
  const FoundryApp({super.key, required this.store});
  @override
  State<FoundryApp> createState() => _FoundryAppState();
}

class _FoundryAppState extends State<FoundryApp> {
  late final router = createFoundryRouter(widget.store);
  @override
  void dispose() {
    router.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    widget.store.initialize();
  }

  ThemeData theme(Brightness b) => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xff087f83),
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
  final int initialTab;
  final Map<String, String> parameters;
  final String settingsSection;
  final String? teamId;
  const Home({
    super.key,
    required this.store,
    this.initialTab = 0,
    this.parameters = const {},
    this.settingsSection = 'account',
    this.teamId,
  });
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  FoundryStore get s => widget.store;
  late int tab;
  String query = '', filter = 'All', sort = 'Recent';
  final search = TextEditingController();
  Timer? searchDebounce;
  void readParameters() {
    tab = widget.initialTab;
    query = widget.parameters['q'] ?? '';
    filter =
        const {
          'public': 'Public',
          'private': 'Private',
          'ready': 'Ready',
          'needs-work': 'Needs work',
          'static': 'Static',
          'animated': 'Animated',
        }[widget.parameters['visibility']] ??
        'All';
    sort =
        const {
          'name': 'Name',
          'stickers': 'Sticker count',
        }[widget.parameters['sort']] ??
        'Recent';
    if (search.text != query) search.text = query;
  }

  @override
  void initState() {
    super.initState();
    readParameters();
    if (tab == 1) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) discover();
      });
    }
  }

  @override
  void didUpdateWidget(covariant Home old) {
    super.didUpdateWidget(old);
    if (old.initialTab != widget.initialTab ||
        old.parameters.length != widget.parameters.length ||
        old.parameters.entries.any(
          (entry) => widget.parameters[entry.key] != entry.value,
        )) {
      readParameters();
    }
  }

  @override
  void dispose() {
    searchDebounce?.cancel();
    search.dispose();
    super.dispose();
  }

  void filters({
    String? q,
    String? visibility,
    String? ordering,
    bool replace = false,
  }) {
    final params = <String, String>{...widget.parameters};
    if (q != null) params['q'] = q;
    if (visibility != null) {
      params['visibility'] =
          const {
            'Public': 'public',
            'Private': 'private',
            'Ready': 'ready',
            'Needs work': 'needs-work',
            'Static': 'static',
            'Animated': 'animated',
          }[visibility] ??
          'all';
    }
    if (ordering != null) {
      params['sort'] =
          const {'Name': 'name', 'Sticker count': 'stickers'}[ordering] ??
          'updated';
    }
    params.removeWhere((k, v) => v.isEmpty || v == 'all' || v == 'updated');
    final url = Uri(
      path: tab == 1 ? '/discover' : '/app/packs',
      queryParameters: params.isEmpty ? null : params,
    ).toString();
    if (replace) {
      context.replace(url);
    } else {
      context.go(url);
    }
  }

  Future<void> discover() => s.run(() async {
    s.publicPacks = objects(await s.api.request('public/packs', auth: false));
  });
  void select(int v) {
    context.go(
      v == 0
          ? '/app/packs'
          : v == 1
          ? '/discover'
          : '/app/settings/account',
    );
  }

  Future<void> create() async {
    final data = await formDialog(
      context,
      'Create pack',
      {'name': 'Name', 'publisher': 'Publisher', 'description': 'Description'},
      optional: {'description'},
      flags: ['isPublic', 'requiresApproval', 'isAnimated'],
      choiceLabels: {
        'teamId': {
          for (final team in s.teams)
            team['id'] as String: team['name'] as String,
        },
      },
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
      if (mounted) context.go('/app/packs/${p['id']}/stickers');
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
        ? (widget.teamId != null
              ? TeamScreen(store: s, id: widget.teamId!)
              : SettingsScreen(store: s, section: widget.settingsSection))
        : Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: search,
                        decoration: const InputDecoration(
                          hintText: 'Search packs',
                          prefixIcon: Icon(Icons.search),
                        ),
                        onChanged: (v) {
                          setState(() => query = v);
                          searchDebounce?.cancel();
                          searchDebounce = Timer(
                            const Duration(milliseconds: 220),
                            () {
                              if (mounted) filters(q: v, replace: true);
                            },
                          );
                        },
                      ),
                    ),
                    PopupMenuButton<String>(
                      tooltip: 'Filter',
                      icon: const Icon(Icons.filter_list),
                      onSelected: (v) => filters(visibility: v),
                      itemBuilder: (_) =>
                          [
                                'All',
                                'Static',
                                'Animated',
                                'Public',
                                'Private',
                                'Ready',
                                'Needs work',
                              ]
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
                      onSelected: (v) => filters(ordering: v),
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
                                  filter == 'Ready' &&
                                      (p['canExport'] == true ||
                                          p['canExport'] == null &&
                                              (p['stickerCount'] ?? 0) >= 3) ||
                                  filter == 'Needs work' &&
                                      (p['canExport'] == false ||
                                          p['canExport'] == null &&
                                              (p['stickerCount'] ?? 0) < 3) ||
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
                              onTap: () => context.go(
                                tab == 1
                                    ? '/share/${p['id']}'
                                    : '/app/packs/${p['id']}/stickers',
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
                  Center(
                    child: Image.asset(
                      'assets/brand/sticker-foundry-icon.png',
                      width: 88,
                      height: 88,
                      semanticLabel: 'Sticker Foundry logo',
                    ),
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

class ResetScreen extends StatefulWidget {
  final FoundryStore store;
  final String token;
  const ResetScreen({super.key, required this.store, required this.token});
  @override
  State<ResetScreen> createState() => _ResetScreenState();
}

class _ResetScreenState extends State<ResetScreen> {
  final form = GlobalKey<FormState>();
  final password = TextEditingController(),
      confirmation = TextEditingController();
  bool visible = false;

  @override
  void dispose() {
    password.dispose();
    confirmation.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (widget.store.busy || !form.currentState!.validate()) return;
    await widget.store.run(() async {
      await widget.store.api.request(
        'auth/password/reset/confirm',
        method: 'POST',
        auth: false,
        data: {'newPassword': password.text, 'token': widget.token},
      );
      await widget.store.signOut();
    }, success: 'Password reset. Sign in with your new password.');
    if (mounted && widget.store.error == null) context.go('/login');
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.store,
    builder: (_, _) => Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: () => context.go('/login')),
        title: const Text('Reset password'),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  messages(widget.store),
                  if (widget.token.isEmpty)
                    const Text(
                      'This reset link is incomplete. Request a new link from the sign-in screen.',
                    )
                  else ...[
                    TextFormField(
                      controller: password,
                      obscureText: !visible,
                      autofillHints: const [AutofillHints.newPassword],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'New password',
                        suffixIcon: action(
                          visible ? Icons.visibility_off : Icons.visibility,
                          visible ? 'Hide passwords' : 'Show passwords',
                          () => setState(() => visible = !visible),
                        ),
                      ),
                      validator: (value) => (value?.length ?? 0) < 8
                          ? 'Use at least 8 characters'
                          : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: confirmation,
                      obscureText: !visible,
                      autofillHints: const [AutofillHints.newPassword],
                      decoration: const InputDecoration(
                        labelText: 'Confirm password',
                      ),
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => submit(),
                      validator: (value) => value != password.text
                          ? 'Passwords do not match'
                          : null,
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: widget.store.busy ? null : submit,
                      child: Text(
                        widget.store.busy ? 'Resetting…' : 'Reset password',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

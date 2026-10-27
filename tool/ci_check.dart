import 'dart:convert';
import 'dart:io';
import 'dart:math';

Future<void> main(List<String> args) async {
  final root = Directory.current.absolute.path;
  final localUv = File(
    Platform.isWindows
        ? 'apps/backend/.venv/Scripts/uv.exe'
        : 'apps/backend/.venv/bin/uv',
  );
  final uv =
      Platform.environment['UV'] ??
      (localUv.existsSync() ? localUv.absolute.path : 'uv');

  Future<void> run(
    String binary,
    List<String> arguments, {
    String? cwd,
    Map<String, String>? env,
  }) async {
    stdout.writeln('> $binary ${arguments.join(' ')}');
    final child = await Process.start(
      binary,
      arguments,
      workingDirectory: cwd ?? root,
      environment: env,
      mode: ProcessStartMode.inheritStdio,
      runInShell: Platform.isWindows && !File(binary).existsSync(),
    );
    final code = await child.exitCode;
    if (code != 0)
      throw ProcessException(binary, arguments, 'Check failed', code);
  }

  await run(uv, ['sync', '--project', 'apps/backend', '--locked']);
  await run(uv, [
    'run',
    '--project',
    'apps/backend',
    'ruff',
    'check',
    'apps/backend/foundry',
    'apps/backend/tests',
    'apps/client/e2e',
    'tool',
  ]);
  await run(uv, [
    'run',
    '--project',
    'apps/backend',
    'ruff',
    'format',
    '--check',
    'apps/backend/foundry',
    'apps/backend/tests',
    'apps/client/e2e',
    'tool',
  ]);
  await run(uv, [
    'run',
    '--project',
    'apps/backend',
    'pytest',
    'apps/backend/tests',
    'tool/tests',
    '-m',
    'not integration',
    '-q',
  ]);
  await run('dart', [
    'format',
    '--output=none',
    '--set-exit-if-changed',
    'apps/client/lib',
    'apps/client/test',
    'apps/client/tool',
    'tool',
  ]);
  await run('flutter', ['analyze'], cwd: '$root/apps/client');
  await run('flutter', ['test'], cwd: '$root/apps/client');
  await run('dart', [
    'run',
    'tool/sync_brand.dart',
    '--check',
  ], cwd: '$root/apps/client');
  await run(uv, [
    'run',
    '--project',
    'apps/backend',
    'python',
    'tool/check_repo.py',
  ]);
  await run(uv, [
    'run',
    '--project',
    'apps/backend',
    'python',
    'tool/check_compose.py',
  ]);
  if (!args.contains('--integration')) return;
  await run(uv, ['run', '--project', 'apps/backend', 'playwright', 'install']);

  final project = 'sticker-foundry-check-$pid';
  final apiPort = await freePort();
  final webPort = await freePort();
  final environment = <String, String>{
    ...Platform.environment,
    'POSTGRES_HOST_PORT': '${await freePort()}',
    'REDIS_HOST_PORT': '${await freePort()}',
    'BACKEND_HOST_PORT': '$apiPort',
    'WEB_HOST_PORT': '$webPort',
    'POSTGRES_USER': 'foundry_check',
    'POSTGRES_DB': 'foundry_check',
    'POSTGRES_PASSWORD': randomSecret(),
    'JWT_SECRET': randomSecret(),
    'APP_ENV': 'development',
    'CORS_ORIGIN': 'http://127.0.0.1:5173,http://127.0.0.1:$webPort',
    'AUTH_REFRESH_COOKIE_SECURE': 'false',
    'REGISTRATION_MODE': 'open',
    'STORAGE_DRIVER': 'disk',
    'BACKGROUND_REMOVAL_COMMAND': '',
    'SMTP_HOST': '',
    'LIVE_QA_API': 'http://127.0.0.1:$apiPort/api/',
    'LIVE_QA_PROJECT': project,
    'WEB_BASE_URL': 'http://127.0.0.1:$webPort',
  };
  try {
    await run('docker', [
      'compose',
      '-p',
      project,
      'up',
      '-d',
      '--build',
    ], env: environment);
    await waitForApi('http://127.0.0.1:$apiPort/api/health/ready');
    await run(uv, [
      'run',
      '--project',
      'apps/backend',
      'pytest',
      'apps/backend/tests/test_live.py',
      '-m',
      'integration',
      '-q',
    ], env: environment);
    await run(uv, [
      'run',
      '--project',
      'apps/backend',
      'pytest',
      'apps/client/e2e',
      '--browser',
      'chromium',
      '--browser',
      'firefox',
      '--browser',
      'webkit',
      '--tracing',
      'retain-on-failure',
      '--video',
      'retain-on-failure',
      '--screenshot',
      'only-on-failure',
      '--output',
      'test-results/playwright',
      '-q',
    ], env: environment);
  } finally {
    await run('docker', [
      'compose',
      '-p',
      project,
      'down',
      '-v',
    ], env: environment);
  }
}

Future<int> freePort() async {
  final socket = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
  final port = socket.port;
  await socket.close();
  return port;
}

String randomSecret() {
  final random = Random.secure();
  return List.generate(
    32,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

Future<void> waitForApi(String url) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 3);
  try {
    for (var attempt = 0; attempt < 120; attempt++) {
      try {
        final request = await client.getUrl(Uri.parse(url));
        final response = await request.close();
        final body = await utf8.decoder.bind(response).join();
        if (response.statusCode == 200 &&
            (jsonDecode(body) as Map)['status'] == 'ok') {
          return;
        }
      } on Exception {
        // The disposable API may still be starting its workers.
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    throw StateError('The disposable API did not become ready.');
  } finally {
    client.close(force: true);
  }
}

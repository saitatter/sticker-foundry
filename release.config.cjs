module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'ci', release: 'patch' },
          { type: 'chore', release: 'patch' },
          { type: 'docs', release: false },
          { type: 'test', release: false },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: '✨ Features' },
            { type: 'fix', section: '🐛 Fixes' },
            { type: 'perf', section: '⚡ Performance' },
            { type: 'refactor', section: '♻️ Refactors' },
            { type: 'ci', section: '🧰 CI & Build' },
            { type: 'chore', section: '🧰 CI & Build' },
            { type: 'docs', section: '📚 Docs', hidden: false },
            { type: 'test', section: '🧪 Tests', hidden: false },
          ],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
        changelogTitle: '# Changelog',
      },
    ],
    ['@semantic-release/exec', { prepareCmd: 'node scripts/set-version.cjs ${nextRelease.version}' }],
    [
      '@semantic-release/git',
      {
        assets: [
          'CHANGELOG.md',
          'package.json',
          'package-lock.json',
          'apps/backend/package.json',
          'apps/web/package.json',
          'packages/shared-types/package.json',
          'apps/android/app/build.gradle.kts',
        ],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          {
            path: 'apps/android/app/build/outputs/apk/debug/app-debug.apk',
            label: 'StickerFoundry Android debug APK',
          },
        ],
      },
    ],
  ],
};

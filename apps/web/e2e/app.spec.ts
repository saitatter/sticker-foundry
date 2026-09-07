import { expect, Locator, Page, Route, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);
const gif1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

type Sticker = {
  id: string;
  fileName: string;
  emojis: string[];
  accessibilityText?: string | null;
  sizeBytes: number;
  sha256: string;
  perceptualHash?: string | null;
  position: number;
  reviewStatus: 'PENDING' | 'APPROVED' | 'NEEDS_WORK';
  createdAt: string;
};

type Pack = {
  id: string;
  name: string;
  publisher: string;
  description?: string | null;
  isPublic: boolean;
  requiresApproval: boolean;
  isAnimated: boolean;
  imageDataVersion: string;
  stickerCount: number;
  updatedAt: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
  canEdit: boolean;
  canManage: boolean;
  stickers?: Sticker[];
};

type ActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  metadata?: unknown;
  actor: { id: string; email: string; displayName: string };
};

test('covers core web sticker workflows with mocked API', async ({ page }) => {
  const state = createMockState();
  state.failTrayIconFor.add('pack-ready');
  await mockApi(page, state);

  await login(page, { openFirstPack: false });

  await expect(page.locator('.pack-library').getByRole('heading', { name: 'Packs' })).toBeVisible();
  await expect(page.locator('.pack-album-grid')).toContainText('Smoke Ready');
  await expect(
    page.getByRole('button', { name: 'Open pack Smoke Ready' }).locator('.pack-cover.has-image img'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open pack Smoke Ready' }).click();
  await expect(page.getByRole('heading', { name: 'Smoke Ready' })).toBeVisible();
  await expect(page.locator('.last-activity-card')).toBeVisible();
  await expect(page.locator('.last-activity-card .activity-row')).toHaveCount(1);
  await expect(page.locator('.activity-panel')).toHaveCount(0);
  await expect(page.locator('.overview-summary')).toContainText('Owner');
  await openStickersTab(page);
  await page.keyboard.press('j');
  await expect(page.locator('.sticker-tile').first()).toHaveClass(/selected/);
  await page.keyboard.press('n');
  await expect(page.locator('.sticker-tile').first()).toContainText('Needs work');
  await expect(page.getByRole('button', { name: 'Move sticker up' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move sticker down' })).toHaveCount(0);
  await expect(page.locator('.sticker-preview-button svg')).toHaveCount(0);
  await page.locator('.sticker-tile').last().hover();
  await page.keyboard.down('Shift');
  await page.locator('.sticker-tile').last().getByRole('button', { name: 'Select sticker' }).click();
  await page.keyboard.up('Shift');
  await expect(page.locator('.sticker-tile.selected')).toHaveCount(3);
  await page.locator('.bulk-toolbar').getByRole('button', { name: 'Clear' }).click();
  await page.keyboard.press('j');
  await page.keyboard.press('Shift+ArrowDown');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => state.packs[0].stickers?.[1]?.id).toBe('sticker-1');
  const sourceTile = page.locator('.sticker-tile').last();
  const targetTile = page.locator('.sticker-tile').first();
  if (test.info().project.name === 'chromium') {
    const sourceBox = await sourceTile.locator('.sticker-drag-handle').boundingBox();
    const targetBox = await targetTile.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('Could not measure sticker tiles for drag test');
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 2, { steps: 2 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
    await page.mouse.up();
  } else {
    const sourceSortable = page.locator('.sticker-grid > div').last();
    await sourceSortable.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
  }
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect
    .poll(() => state.packs[0].stickers?.map((sticker) => sticker.id))
    .toEqual(['sticker-3', 'sticker-2', 'sticker-1']);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sticker-grid')).toBeVisible();
  await expect.poll(() => stickerGridColumnCount(page)).toBeGreaterThanOrEqual(2);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Preview JSON' }).click();
  await expect(page.locator('.contents-preview')).toContainText('sticker_packs');
  await page.getByRole('tab', { name: 'Collaboration' }).click();
  await expect(page.getByRole('heading', { name: 'Collaboration' })).toBeVisible();
  await openStickersTab(page);
  await page.locator('.sticker-preview-button').first().click();
  await expect(page.getByRole('heading', { name: 'Sticker detail' })).toBeVisible();
  await page.locator('.sticker-detail-dialog').getByRole('button', { name: 'Close' }).click();

  const firstSticker = page.locator('.sticker-tile').first();
  await firstSticker.getByRole('button', { name: 'Edit' }).click();
  const stickerDialog = page.getByRole('dialog', { name: 'Sticker detail' });
  await expect(stickerDialog).toBeVisible();
  await stickerDialog.locator('.sticker-replace-form input[type=file]').setInputFiles({
    name: 'replace.png',
    mimeType: 'image/png',
    buffer: png1x1,
  });
  await expect(stickerDialog.locator('.upload-edit-summary')).toContainText('AI bg');
  await stickerDialog.locator('.upload-edit-summary').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog', { name: 'Sticker image editor' })).toBeVisible();
  await page.getByRole('tab', { name: 'Background' }).click();
  await page.locator('.image-editor-modal').getByRole('button', { name: 'Apply edits' }).click();
  await stickerDialog.getByRole('button', { name: 'Close' }).click();

  const newPackPanel = await openNewPackPanel(page);
  await newPackPanel.getByLabel('Name').fill('Scratch Pack');
  await newPackPanel.getByLabel('Publisher').fill('QA');
  await newPackPanel.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Scratch Pack' })).toBeVisible();

  await openStickersTab(page);
  await page.locator('.upload-panel input[type=file]').setInputFiles({
    name: 'smoke.png',
    mimeType: 'image/png',
    buffer: png1x1,
  });
  await page.locator('.upload-panel').getByRole('button', { name: 'Upload' }).click();
  await expect.poll(() => state.uploads.length).toBe(1);
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.locator('.overview-summary')).toContainText('1/30');

  await page.getByRole('button', { name: 'Open packs' }).click();
  await page.getByRole('button', { name: 'Open pack Smoke Ready' }).click();
  await openStickersTab(page);
  await page.locator('.bulk-toolbar').getByRole('button', { name: 'Select all' }).click();
  await page.locator('.bulk-toolbar').getByLabel('Target').selectOption({ label: 'Scratch Pack (1/30)' });
  await page.locator('.bulk-toolbar').getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Selected stickers copied')).toBeVisible();
});

test('saves pack details and tray icon together from the global save action', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page);

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByLabel('Name').fill('Saved Pack Name');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Saved Pack Name');
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Smoke Ready');
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await page.getByLabel('Name').fill('Saved Pack Name');
  await page.locator('.tray-file-picker input[type=file]').setInputFiles({
    name: 'tray.png',
    mimeType: 'image/png',
    buffer: png1x1,
  });
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => state.packs[0].name).toBe('Saved Pack Name');
  await expect.poll(() => state.trayUploads).toBe(1);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard' })).toHaveCount(0);
  await expect(page.locator('.notice.success')).toHaveCSS('position', 'fixed');
});

test('supports direct workspace navigation, refresh, and browser history', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page, { openFirstPack: false });

  await page.goto('/app/packs/pack-ready');
  await expect(page).toHaveURL(/\/app\/packs\/pack-ready$/);
  await expect(page.getByRole('heading', { name: 'Smoke Ready' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Smoke Ready' })).toBeVisible();

  await page.goto('/app/packs');
  await expect(page.getByRole('heading', { name: 'Packs' })).toBeVisible();
  await page.getByRole('button', { name: 'Open pack Smoke Ready' }).click();
  await expect(page).toHaveURL(/\/app\/packs\/pack-ready$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/packs$/);
  await expect(page.getByRole('heading', { name: 'Packs' })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/app\/packs\/pack-ready$/);
  await expect(page.getByRole('heading', { name: 'Smoke Ready' })).toBeVisible();
});

test('restores a protected session without flashing the login screen', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { __sawAuthLayout?: boolean };
    state.__sawAuthLayout = false;
    new MutationObserver(() => {
      if (document.querySelector('.auth-layout')) state.__sawAuthLayout = true;
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  const state = createMockState();
  await mockApi(page, state);

  await page.goto('/app/packs/pack-ready');
  await expect(page.getByRole('heading', { name: 'Smoke Ready' })).toBeVisible();
  await expect(page.locator('.auth-layout')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __sawAuthLayout?: boolean }).__sawAuthLayout)).toBe(false);
});

test('paginates pack activity and changes the page size', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page, { openFirstPack: false });

  await page.goto('/app/packs/pack-ready/activity');
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.locator('.activity-row')).toHaveCount(10);
  await page.locator('.activity-row').first().click();
  await expect(page.getByRole('dialog', { name: 'Pack Update' })).toBeVisible();
  await expect(page.locator('.activity-detail-dialog')).toContainText('Before');
  await expect(page.locator('.activity-detail-dialog')).toContainText('After');
  await expect(page.locator('.activity-snapshot').nth(1)).toContainText('Smoke Ready');
  await page.getByRole('dialog', { name: 'Pack Update' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Showing 1–10 of 31')).toBeVisible();
  await page.getByRole('button', { name: 'Activity page 2' }).click();
  await expect(page.locator('.activity-row')).toHaveCount(10);
  await expect(page.getByText('Showing 11–20 of 31')).toBeVisible();

  await page.getByLabel('Activities per page').selectOption('25');
  await expect(page.locator('.activity-row')).toHaveCount(25);
  await expect(page.getByText('Showing 1–25 of 31')).toBeVisible();

  await page.getByLabel('Activities per page').selectOption('all');
  await expect(page.locator('.activity-row')).toHaveCount(31);
  await expect(page.getByText('Showing 1–31 of 31')).toBeVisible();
});

test('packs workspace has no obvious accessibility violations', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page, { openFirstPack: false });

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('opens admin settings as a dedicated page and switches to dark theme', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page, { openFirstPack: false });

  await page.locator('.workspace-nav').getByRole('button', { name: 'Open account settings' }).click();
  await expect(page).toHaveURL(/\/app\/settings\/account$/);
  await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  await expect(page.locator('.modal-panel')).toHaveCount(0);

  await page.locator('.workspace-nav').getByRole('button', { name: 'Open admin settings' }).click();

  await expect(page).toHaveURL(/\/app\/settings\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Instance settings' })).toBeVisible();
  await expect(page.locator('.modal-panel')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.settings-card').first()).toHaveCSS('background-color', 'rgb(24, 36, 34)');
});

test('keeps password reset links public when a refresh cookie exists', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);

  await page.goto('/reset-password?token=reset-token');

  await expect(page).toHaveURL(/\/reset-password\?token=reset-token$/);
  await expect(page.getByText('Choose a new password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset password' })).toBeVisible();
});

test('supports brush editing undo redo and before after compare', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page);

  await chooseUploadImage(page, 'brush.png', 'image/png', png1x1);
  const editor = await openUploadEditor(page);
  const canvas = editor.getByLabel('Edited preview canvas');
  await expect(canvas).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Undo brush' })).toBeDisabled();

  await editor.getByRole('button', { name: 'Erase brush' }).click();
  await drawOnCanvas(canvas);
  await expect(editor.getByRole('button', { name: 'Undo brush' })).toBeEnabled();
  await editor.getByRole('button', { name: 'Undo brush' }).click();
  await expect(editor.getByRole('button', { name: 'Redo brush' })).toBeEnabled();
  await editor.getByRole('button', { name: 'Redo brush' }).click();

  await editor.getByRole('button', { name: 'Restore brush' }).click();
  await drawOnCanvas(canvas);
  await editor.getByRole('button', { name: 'Compare before after' }).click();
  await expect(editor.getByText('Before')).toBeVisible();
  await expect(editor.getByText('After')).toBeVisible();
});

test('submits optimizer and server background removal options', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page);

  await chooseUploadImage(page, 'server-bg.png', 'image/png', png1x1);
  const editor = await openUploadEditor(page);
  await editor.getByRole('tab', { name: 'Output' }).click();
  await editor.getByLabel('Optimize under 100KB').check();
  await expect(editor.locator('.optimizer-panel')).toContainText(/Output/);
  await editor.getByRole('tab', { name: 'Background' }).click();
  await editor.getByLabel('Background removal').selectOption('ai');
  await expect(
    editor.getByText('rembg is configured as primary; failed AI runs fall back to threshold cleanup.'),
  ).toBeVisible();
  await page.locator('.image-editor-modal').getByRole('button', { name: 'Apply edits' }).click();

  await page.locator('.upload-panel').getByRole('button', { name: 'Upload' }).click();
  await expect.poll(() => state.uploads.length).toBe(1);
  expect(state.uploads[0].body).toContain('name="backgroundRemovalMode"');
  expect(state.uploads[0].body).toContain('ai');
  expect(state.uploads[0].body).toContain('name="backgroundRemovalThreshold"');
});

test('submits animated trim and frame rate upload options', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page);

  const newPackPanel = await openNewPackPanel(page);
  await newPackPanel.getByLabel('Name').fill('Animated Smoke');
  await newPackPanel.getByLabel('Publisher').fill('QA');
  await newPackPanel.getByLabel('Animated pack').check();
  await newPackPanel.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('.overview-summary')).toContainText('Animated');

  await openStickersTab(page);
  await chooseUploadImage(page, 'motion.gif', 'image/gif', gif1x1);
  const editor = await openUploadEditor(page);
  await editor.getByRole('tab', { name: 'Output' }).click();
  await expect(editor.locator('.animated-panel')).toBeVisible();
  await editor.getByLabel('Trim start').fill('1');
  await editor.getByLabel('Trim end').fill('5');
  await editor.getByLabel('Frame rate').fill('12');
  await page.locator('.image-editor-modal').getByRole('button', { name: 'Apply edits' }).click();

  await page.locator('.upload-panel').getByRole('button', { name: 'Upload' }).click();
  await expect.poll(() => state.uploads.length).toBe(1);
  expect(state.uploads[0].packId).toBe('pack-2');
  expect(state.uploads[0].body).toContain('name="animatedTrimStart"');
  expect(state.uploads[0].body).toContain('1');
  expect(state.uploads[0].body).toContain('name="animatedTrimEnd"');
  expect(state.uploads[0].body).toContain('5');
  expect(state.uploads[0].body).toContain('name="animatedFrameRate"');
  expect(state.uploads[0].body).toContain('12');
});

function createMockState() {
  const stickers: Sticker[] = [0, 1, 2].map((index) => ({
    id: `sticker-${index + 1}`,
    fileName: `sticker-${index + 1}.webp`,
    emojis: ['😀'],
    accessibilityText: `Sticker ${index + 1}`,
    sizeBytes: 512,
    sha256: `sha-${index + 1}`,
    position: index,
    reviewStatus: 'APPROVED',
    createdAt: new Date().toISOString(),
  }));
  const packs: Pack[] = [
    {
      id: 'pack-ready',
      name: 'Smoke Ready',
      publisher: 'Sticker Foundry',
      description: null,
      isPublic: false,
      requiresApproval: false,
      isAnimated: false,
      imageDataVersion: '1',
      stickerCount: stickers.length,
      updatedAt: new Date().toISOString(),
      role: 'OWNER',
      canEdit: true,
      canManage: true,
      stickers,
    },
  ];

  return {
    failTrayIconFor: new Set<string>(),
    packs,
    trayUploads: 0,
    activity: Array.from(
      { length: 31 },
      (_, index): ActivityEntry => ({
        id: `activity-${index + 1}`,
        action: index === 0 ? 'pack.update' : 'pack.updated',
        entityType: 'pack',
        createdAt: new Date(Date.now() - index * 60_000).toISOString(),
        metadata:
          index === 0
            ? {
                before: { name: 'Old name' },
                after: { name: 'Smoke Ready' },
              }
            : undefined,
        actor: { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo' },
      }),
    ),
    uploads: [] as Array<{ packId: string; body: string }>,
    jobs: new Map<string, { id: string }>(),
  };
}

async function mockApi(page: Page, state: ReturnType<typeof createMockState>) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    const path = url.pathname.replace('/api', '');
    const method = request.method();

    if (method === 'POST' && path === '/auth/login') {
      return json(route, {
        accessToken: 'access-token',
        refreshToken: 'refresh-token-that-is-long-enough',
        user: { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo', isAdmin: true },
      });
    }
    if (method === 'POST' && path === '/auth/refresh') {
      return json(route, {
        accessToken: 'access-token',
        user: { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo', isAdmin: true },
      });
    }
    if (method === 'GET' && path === '/auth/me') {
      return json(route, { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo', isAdmin: true });
    }
    if (method === 'GET' && path === '/auth/sessions') {
      return json(route, []);
    }
    if (method === 'GET' && path === '/admin/settings') {
      return json(route, {
        registrationMode: 'open',
        registrationInviteCode: '',
        storageQuotaBytes: null,
        auditRetentionDays: null,
        instanceName: 'Sticker Foundry',
        instanceDescription: 'Self-hosted sticker pack management',
        backgroundRemoval: {
          thresholdAvailable: true,
          aiCommandConfigured: true,
          aiMode: 'command',
          fallbackMode: 'threshold',
        },
      });
    }
    if (method === 'GET' && path === '/admin/audit-log') {
      return json(route, []);
    }
    if (method === 'GET' && path === '/packs') {
      return json(
        route,
        state.packs.map(({ stickers, ...pack }) => pack),
      );
    }
    if (method === 'GET' && path === '/teams') {
      return json(route, []);
    }
    if (method === 'POST' && path === '/packs') {
      const body = request.postDataJSON() as {
        name: string;
        publisher: string;
        isPublic?: boolean;
        isAnimated?: boolean;
      };
      const pack: Pack = {
        id: `pack-${state.packs.length + 1}`,
        name: body.name,
        publisher: body.publisher,
        description: null,
        isPublic: body.isPublic ?? false,
        requiresApproval: false,
        isAnimated: body.isAnimated ?? false,
        imageDataVersion: '1',
        stickerCount: 0,
        updatedAt: new Date().toISOString(),
        role: 'OWNER',
        canEdit: true,
        canManage: true,
        stickers: [],
      };
      state.packs.unshift(pack);
      return json(route, pack);
    }

    const packMatch = path.match(/^\/packs\/([^/]+)$/);
    if (method === 'GET' && packMatch) {
      return json(route, packById(state, packMatch[1]));
    }

    if (method === 'PATCH' && packMatch) {
      const pack = packById(state, packMatch[1]);
      Object.assign(pack, request.postDataJSON() as Partial<Pack>);
      return json(route, pack);
    }

    const contentsMatch = path.match(/^\/packs\/([^/]+)\/contents$/);
    if (method === 'GET' && contentsMatch) {
      const pack = packById(state, contentsMatch[1]);
      return json(route, {
        sticker_packs: [
          {
            identifier: pack.id,
            name: pack.name,
            publisher: pack.publisher,
            tray_image_file: 'tray_icon.webp',
            image_data_version: pack.imageDataVersion,
            animated_sticker_pack: pack.isAnimated,
            stickers: pack.stickers?.map((sticker) => ({
              image_file: sticker.fileName,
              emojis: sticker.emojis,
              accessibility_text: sticker.accessibilityText,
            })),
          },
        ],
      });
    }

    const trayIconMatch = path.match(/^\/packs\/([^/]+)\/(tray-icon|cover)$/);
    if (
      method === 'GET' &&
      trayIconMatch &&
      trayIconMatch[2] === 'tray-icon' &&
      state.failTrayIconFor.has(trayIconMatch[1])
    ) {
      return json(route, { message: 'Tray icon not found' }, 404);
    }

    if (method === 'GET' && path.match(/^\/packs\/[^/]+\/(tray-icon|cover|stickers\/[^/]+\/file)$/)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
    }

    const trayUploadMatch = path.match(/^\/packs\/([^/]+)\/tray-icon$/);
    if (method === 'POST' && trayUploadMatch) {
      const pack = packById(state, trayUploadMatch[1]);
      state.trayUploads += 1;
      pack.imageDataVersion = String(Number(pack.imageDataVersion) + 1);
      return json(route, pack);
    }

    const uploadMatch = path.match(/^\/packs\/([^/]+)\/stickers$/);
    if (method === 'POST' && uploadMatch) {
      const pack = packById(state, uploadMatch[1]);
      state.uploads.push({ packId: pack.id, body: request.postDataBuffer()?.toString('utf8') ?? '' });
      const sticker = newSticker(pack, `uploaded-${Date.now()}.webp`);
      pack.stickers = [...(pack.stickers ?? []), sticker];
      pack.stickerCount = pack.stickers.length;
      return json(route, sticker, 201);
    }

    const reorderMatch = path.match(/^\/packs\/([^/]+)\/stickers$/);
    if (method === 'PATCH' && reorderMatch) {
      const pack = packById(state, reorderMatch[1]);
      const body = request.postDataJSON() as { stickerIds: string[] };
      pack.stickers = body.stickerIds
        .map((id, index) => {
          const sticker = pack.stickers?.find((item) => item.id === id);
          return sticker ? { ...sticker, position: index } : null;
        })
        .filter((sticker): sticker is Sticker => Boolean(sticker));
      return json(route, pack);
    }

    const updateStickerMatch = path.match(/^\/packs\/([^/]+)\/stickers\/([^/]+)$/);
    if (method === 'PATCH' && updateStickerMatch) {
      const pack = packById(state, updateStickerMatch[1]);
      const sticker = pack.stickers?.find((item) => item.id === updateStickerMatch[2]);
      if (!sticker) return json(route, { message: 'Sticker not found' }, 404);
      const body = request.postDataJSON() as Partial<Sticker>;
      Object.assign(sticker, {
        emojis: body.emojis ?? sticker.emojis,
        accessibilityText: body.accessibilityText ?? sticker.accessibilityText,
        reviewStatus: body.reviewStatus ?? sticker.reviewStatus,
      });
      pack.imageDataVersion = String(Number(pack.imageDataVersion) + 1);
      return json(route, sticker);
    }

    const copyMatch = path.match(/^\/packs\/([^/]+)\/stickers\/copy$/);
    if (method === 'POST' && copyMatch) {
      const source = packById(state, copyMatch[1]);
      const body = request.postDataJSON() as { targetPackId: string; stickerIds: string[] };
      const target = packById(state, body.targetPackId);
      const selected = (source.stickers ?? []).filter((sticker) => body.stickerIds.includes(sticker.id));
      target.stickers = [
        ...(target.stickers ?? []),
        ...selected.map((sticker) => newSticker(target, `copy-${sticker.fileName}`)),
      ];
      target.stickerCount = target.stickers.length;
      return json(route, target);
    }

    if (method === 'GET' && path.match(/^\/packs\/[^/]+\/(members|invites)$/)) {
      return json(route, []);
    }
    if (method === 'GET' && path.match(/^\/packs\/[^/]+\/activity$/)) {
      return json(route, state.activity);
    }

    const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
    if (method === 'GET' && jobMatch) {
      const job = state.jobs.get(jobMatch[1]);
      if (!job) return json(route, { message: 'Job not found' }, 404);
      return json(route, { ...job, status: 'COMPLETED', progress: 100 });
    }

    const queuedUploadMatch = path.match(/^\/packs\/([^/]+)\/stickers\/jobs$/);
    if (method === 'POST' && queuedUploadMatch) {
      const pack = packById(state, queuedUploadMatch[1]);
      state.uploads.push({ packId: pack.id, body: request.postDataBuffer()?.toString('utf8') ?? '' });
      const sticker = newSticker(pack, `uploaded-${Date.now()}.webp`);
      pack.stickers = [...(pack.stickers ?? []), sticker];
      pack.stickerCount = pack.stickers.length;
      const jobId = `job-${state.uploads.length}`;
      state.jobs.set(jobId, { id: jobId });
      return json(route, { id: jobId, status: 'QUEUED', progress: 0 }, 202);
    }

    return json(route, { message: `Unhandled ${method} ${path}` }, 404);
  });
}

function packById(state: ReturnType<typeof createMockState>, id: string) {
  const pack = state.packs.find((item) => item.id === id);
  if (!pack) throw new Error(`Missing pack ${id}`);
  return pack;
}

function newSticker(pack: Pack, fileName: string): Sticker {
  return {
    id: `${pack.id}-sticker-${(pack.stickers?.length ?? 0) + 1}`,
    fileName,
    emojis: ['😀'],
    accessibilityText: null,
    sizeBytes: 512,
    sha256: `${fileName}-sha`,
    position: pack.stickers?.length ?? 0,
    reviewStatus: 'PENDING',
    createdAt: new Date().toISOString(),
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function login(page: Page, options: { openFirstPack?: boolean } = {}) {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo@stickerfoundry.local');
  await page.getByRole('textbox', { name: /Password/ }).fill('stickerfoundry123');
  await page.locator('form').getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/app\/packs$/);
  if (options.openFirstPack ?? true) {
    await page.getByRole('button', { name: 'Open pack Smoke Ready' }).click();
    await openStickersTab(page);
  }
}

async function chooseUploadImage(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.locator('.upload-panel input[type=file]').setInputFiles({ name, mimeType, buffer });
}

async function openStickersTab(page: Page) {
  const stickersTab = page.getByRole('tab', { name: /Stickers/ });
  await stickersTab.click();
  await expect(stickersTab).toHaveAttribute('aria-selected', 'true');
}

async function openUploadEditor(page: Page) {
  await page.locator('.upload-panel').getByRole('button', { name: 'Edit' }).click();
  const editor = page.locator('.image-editor-modal .image-edit-controls').first();
  await expect(editor).toBeVisible();
  return editor;
}

async function openNewPackPanel(page: Page) {
  await page.getByRole('button', { name: 'Create or join' }).click();
  const drawer = page.getByRole('dialog', { name: 'Create and join' });
  await expect(drawer).toBeVisible();
  return drawer.locator('.tool-panel').filter({ hasText: 'New pack' });
}

async function drawOnCanvas(canvas: Locator) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Missing editor canvas bounds');
  await canvas.page().mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
  await canvas.page().mouse.down();
  await canvas.page().mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.65, { steps: 4 });
  await canvas.page().mouse.up();
}

async function stickerGridColumnCount(page: Page) {
  return page
    .locator('.sticker-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
}

import { expect, Locator, Page, Route, test } from '@playwright/test';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

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

test('covers core web sticker workflows with mocked API', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);

  await login(page);

  await expect(page.getByRole('heading', { name: 'Packs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Smoke Ready' })).toBeVisible();
  await expect(page.locator('.stats-grid')).toContainText('Owner');
  await page.keyboard.press('j');
  await expect(page.locator('.sticker-tile').first()).toHaveClass(/selected/);
  await page.keyboard.press('n');
  await expect(page.locator('.sticker-tile').first()).toContainText('Needs work');
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(() => state.packs[0].stickers?.[1]?.id).toBe('sticker-1');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sticker-grid')).toBeVisible();
  await expect.poll(() => stickerGridColumnCount(page)).toBeGreaterThanOrEqual(2);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('button', { name: 'Preview JSON' }).click();
  await expect(page.locator('.contents-preview')).toContainText('sticker_packs');
  await expect(page.getByRole('heading', { name: 'Collaboration' })).toBeVisible();
  await page.locator('.sticker-preview-button').first().click();
  await expect(page.getByRole('heading', { name: 'Sticker detail' })).toBeVisible();
  await page.locator('.sticker-detail-dialog').getByRole('button', { name: 'Close' }).click();

  await page.locator('.tool-panel').filter({ hasText: 'New pack' }).getByLabel('Name').fill('Scratch Pack');
  await page.locator('.tool-panel').filter({ hasText: 'New pack' }).getByLabel('Publisher').fill('QA');
  await page.locator('.tool-panel').filter({ hasText: 'New pack' }).getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Scratch Pack' })).toBeVisible();

  await page.locator('.upload-panel input[type=file]').setInputFiles({
    name: 'smoke.png',
    mimeType: 'image/png',
    buffer: png1x1,
  });
  await page.locator('.upload-panel').getByRole('button', { name: 'Upload' }).click();
  await expect(page.locator('.stats-grid')).toContainText('1/30');

  await page.getByRole('button', { name: 'Smoke Ready' }).click();
  await page.locator('.bulk-toolbar').getByRole('button', { name: 'Select all' }).click();
  await page.locator('.bulk-toolbar').getByLabel('Target').selectOption({ label: 'Scratch Pack (1/30)' });
  await page.locator('.bulk-toolbar').getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Selected stickers copied')).toBeVisible();
});

test('supports brush editing undo redo and before after compare', async ({ page }) => {
  const state = createMockState();
  await mockApi(page, state);
  await login(page);

  await chooseUploadImage(page, 'brush.png', 'image/png', png1x1);
  const editor = page.locator('.image-edit-controls').first();
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
      publisher: 'StickerFoundry',
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

  return { packs };
}

async function mockApi(page: Page, state: ReturnType<typeof createMockState>) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api', '');
    const method = request.method();

    if (method === 'POST' && path === '/auth/login') {
      return json(route, {
        accessToken: 'access-token',
        refreshToken: 'refresh-token-that-is-long-enough',
        user: { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo', isAdmin: true },
      });
    }
    if (method === 'GET' && path === '/auth/me') {
      return json(route, { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo', isAdmin: true });
    }
    if (method === 'GET' && path === '/admin/settings') {
      return json(route, {
        registrationMode: 'open',
        registrationInviteCode: '',
        storageQuotaBytes: null,
        auditRetentionDays: null,
        instanceName: 'StickerFoundry',
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
      return json(route, state.packs.map(({ stickers, ...pack }) => pack));
    }
    if (method === 'GET' && path === '/teams') {
      return json(route, []);
    }
    if (method === 'POST' && path === '/packs') {
      const body = request.postDataJSON() as { name: string; publisher: string; isPublic?: boolean; isAnimated?: boolean };
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

    if (method === 'GET' && path.match(/^\/packs\/[^/]+\/(tray-icon|stickers\/[^/]+\/file)$/)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
    }

    const uploadMatch = path.match(/^\/packs\/([^/]+)\/stickers$/);
    if (method === 'POST' && uploadMatch) {
      const pack = packById(state, uploadMatch[1]);
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
      return json(route, []);
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

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo@stickerfoundry.local');
  await page.getByRole('textbox', { name: /Password/ }).fill('stickerfoundry123');
  await page.locator('form').getByRole('button', { name: 'Login' }).click();
}

async function chooseUploadImage(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.locator('.upload-panel input[type=file]').setInputFiles({ name, mimeType, buffer });
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
  return page.locator('.sticker-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
}

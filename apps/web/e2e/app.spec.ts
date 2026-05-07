import { expect, Page, Route, test } from '@playwright/test';

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

  await page.goto('/');
  await page.getByLabel('Email').fill('demo@stickerfoundry.local');
  await page.getByRole('textbox', { name: /Password/ }).fill('stickerfoundry123');
  await page.locator('form').getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('heading', { name: 'Packs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Smoke Ready' })).toBeVisible();
  await expect(page.locator('.stats-grid')).toContainText('Owner');

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
        user: { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo' },
      });
    }
    if (method === 'GET' && path === '/auth/me') {
      return json(route, { id: 'user-1', email: 'demo@stickerfoundry.local', displayName: 'Demo' });
    }
    if (method === 'GET' && path === '/packs') {
      return json(route, state.packs.map(({ stickers, ...pack }) => pack));
    }
    if (method === 'GET' && path === '/teams') {
      return json(route, []);
    }
    if (method === 'POST' && path === '/packs') {
      const body = request.postDataJSON() as { name: string; publisher: string; isPublic?: boolean };
      const pack: Pack = {
        id: `pack-${state.packs.length + 1}`,
        name: body.name,
        publisher: body.publisher,
        description: null,
        isPublic: body.isPublic ?? false,
        requiresApproval: false,
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
            animated_sticker_pack: false,
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

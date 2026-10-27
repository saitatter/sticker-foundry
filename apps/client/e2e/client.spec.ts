import { test, expect, Page } from '@playwright/test';

const user = { id: 'user', displayName: 'Artist', email: 'artist@example.test', isAdmin: true };
const initial = {
  id: 'pack',
  name: 'Little moments',
  publisher: 'Artist',
  isPublic: true,
  isAnimated: false,
  canEdit: true,
  canManage: true,
  canExport: true,
  imageDataVersion: '1',
  stickerCount: 3,
  stickers: [1, 2, 3].map((i) => ({
    id: `s${i}`,
    fileName: `s${i}.webp`,
    emojis: ['??'],
    reviewStatus: 'PENDING',
    accessibilityText: `Sticker ${i}`,
  })),
};
async function accessible(page: Page) {
  await page.goto('/');
  await page.locator('flt-semantics-placeholder').evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sticker Foundry logo', exact: true })).toBeVisible();
}
async function fill(page: Page, label: string, value: string) {
  const field = page.getByRole('textbox', { name: label, exact: true });
  await field.click();
  await page.waitForTimeout(250);
  await field.press('ControlOrMeta+A');
  await field.pressSequentially(value, { delay: 20 });
  await field.press('Tab');
}
test.beforeEach(async ({ page }) => {
  let packs = [{ ...initial }];
  let signedIn = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace('/api/', ''),
      method = request.method();
    if (path.endsWith('/file')) {
      await route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      return;
    }
    if (path.endsWith('/cover')) {
      await route.fulfill({ status: 404, json: { message: 'No icon yet' } });
      return;
    }
    let body: unknown = {};
    let status = 200;
    if (path === 'auth/refresh') {
      status = signedIn ? 200 : 401;
      body = signedIn ? { accessToken: 'token', user } : { message: 'Expired' };
    } else if (path === 'instance') body = { instanceName: 'Sticker Foundry' };
    else if (path === 'auth/login') {
      signedIn = true;
      body = { accessToken: 'token', refreshToken: 'refresh', user };
    } else if (path === 'auth/me') body = user;
    else if (path === 'admin/settings')
      body = {
        instanceName: 'Sticker Foundry',
        registrationMode: 'open',
        backgroundRemoval: { thresholdAvailable: true },
      };
    else if (path.endsWith('/activity'))
      body = Array.from({ length: 12 }, (_, i) => ({
        id: `event-${i}`,
        action: `Event ${i}`,
        createdAt: '2026-10-26',
      }));
    else if (path.match(/packs\/pack\/stickers\/s\d$/) && method === 'PATCH') {
      packs[0].stickers = packs[0].stickers.map((sticker) =>
        path.endsWith('/' + sticker.id) ? { ...sticker, ...request.postDataJSON() } : sticker,
      );
      body = {};
    } else if (path === 'packs' && method === 'POST') {
      const p = { ...initial, ...request.postDataJSON(), id: 'new-pack', stickerCount: 0, canExport: false };
      packs.push(p);
      body = p;
    } else if (path === 'packs' || path === 'public/packs') body = packs;
    else if (
      path === 'teams' ||
      path === 'auth/sessions' ||
      path.endsWith('/members') ||
      path.endsWith('/invites') ||
      path === 'unused'
    )
      body = [];
    else if (/^packs\/[^/]+$/.test(path) && method === 'PATCH') {
      const id = path.split('/')[1];
      packs = packs.map((p) => (p.id === id ? { ...p, ...request.postDataJSON() } : p));
      body = packs.find((p) => p.id === id);
    } else if (path === 'packs/new-pack' && method === 'DELETE') packs = packs.filter((p) => p.id !== 'new-pack');
    else if (path === 'sync/packs') body = { packs: [] };
    else if (path.startsWith('packs/') || path.startsWith('public/packs/'))
      body = packs.find((p) => path.split('packs/')[1].split('/')[0] === p.id) ?? initial;
    await route.fulfill({ status, json: body });
  });
});
test('sign in, search, create and rename a pack', async ({ page }) => {
  await accessible(page);
  await fill(page, 'Email', user.email);
  await fill(page, 'Password', 'correct-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your library', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Little moments/ })).toBeVisible();
  await page.getByRole('button', { name: 'Create pack', exact: true }).click();
  await fill(page, 'Name', 'New collection');
  await fill(page, 'Publisher', 'Artist');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('New collection', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pack actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Pack settings', exact: true }).click();
  await expect(page).toHaveURL(/app\/packs\/new-pack\/settings/);
  await fill(page, 'Name', 'Renamed collection');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Renamed collection', { exact: true })).toBeVisible();
});
test('public discovery works at phone width without signing in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await accessible(page);
  await page.getByRole('button', { name: 'Explore public packs', exact: true }).click();
  await expect(page.getByRole('button', { name: /Little moments/ })).toBeVisible();
  await page.getByRole('button', { name: /Little moments/ }).click();
  await expect(page.getByRole('button', { name: 'Pack actions', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pack actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Export ZIP', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete pack', exact: true })).toHaveCount(0);
});
test('invalid credentials display the server message and keep the form usable', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { message: 'Invalid email or password' } }),
  );
  await accessible(page);
  await fill(page, 'Email', user.email);
  await fill(page, 'Password', 'wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
});

async function signIn(page: Page) {
  await accessible(page);
  await fill(page, 'Email', user.email);
  await fill(page, 'Password', 'correct-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your library', { exact: true })).toBeVisible();
}

test('deep links, refresh and browser history preserve the workspace', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /Little moments/ }).click();
  await expect(page).toHaveURL(/app\/packs\/pack\/stickers/);
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page).toHaveURL(/\/activity$/);
  // Firefox's automation reload adds a history entry even on a plain HTML page.
  // Exercise the browser's native reload so Back/Forward verifies application history.
  await Promise.all([page.waitForEvent('domcontentloaded'), page.evaluate(() => location.reload())]);
  await page.locator('flt-semantics-placeholder').evaluate((el: HTMLElement) => el.click());
  await expect(page.getByRole('group', { name: /Page 1 of 2/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/stickers$/);
  await expect(page.getByRole('checkbox', { name: 'Select sticker 1' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('group', { name: /Page 1 of 2/ })).toBeVisible();
});

test('keyboard and range selection persist bulk review status', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /Little moments/ }).click();
  await page.getByRole('checkbox', { name: 'Select sticker 1' }).click();
  await page.keyboard.down('Shift');
  await page.getByRole('checkbox', { name: 'Select sticker 3' }).click();
  await page.keyboard.up('Shift');
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(3);
  const updates: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/stickers/s')) updates.push(r.postDataJSON().reviewStatus);
  });
  await page.keyboard.press('n');
  await expect.poll(() => updates).toEqual(['NEEDS_WORK', 'NEEDS_WORK', 'NEEDS_WORK']);
  await expect(page.getByRole('button', { name: 'Add stickers', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
});

test('activity supports pagination and page size changes', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /Little moments/ }).click();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('group', { name: /Page 1 of 2/ })).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('group', { name: /^Event 10 / })).toBeVisible();
  await page.getByRole('button', { name: '10 per page', exact: true }).click();
  await page.getByRole('menuitem', { name: '25 per page', exact: true }).click();
  await expect(page.getByRole('group', { name: /Page 1 of 1/ })).toBeVisible();
});

test('admin settings are a dedicated route and password reset remains public', async ({ page }) => {
  await signIn(page);
  await page.goto('/app/settings/instance');
  await page.locator('flt-semantics-placeholder').evaluate((el: HTMLElement) => el.click());
  await expect(page.getByRole('textbox', { name: 'Instance name', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeVisible();
  await page.goto('/reset-password?token=reset-fixture');
  await page.locator('flt-semantics-placeholder').evaluate((el: HTMLElement) => el.click());
  await expect(page.getByRole('button', { name: 'Choose new password', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose new password', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'New password', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/reset-password\?token=reset-fixture$/);
});

test('one save persists pending pack metadata and the edited tray icon', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /Little moments/ }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await fill(page, 'Name', 'Saved together');
  const writes: Array<{ path: string; version?: string }> = [];
  page.on('request', (r) => {
    if (['PATCH', 'POST'].includes(r.method()) && r.url().includes('/packs/pack'))
      writes.push({ path: new URL(r.url()).pathname, version: r.headers()['if-match'] });
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Change tray icon', exact: true }).click();
  await (await chooser).setFiles('assets/brand/sticker-foundry-icon.png');
  await expect(page.getByRole('button', { name: 'Use image', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use image', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard pending tray icon', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0].path).toBe('/api/packs/pack');
  expect(writes[1]).toEqual({ path: '/api/packs/pack/tray-icon', version: '1' });
  await expect(page.getByRole('button', { name: 'Discard pending tray icon', exact: true })).toHaveCount(0);
});

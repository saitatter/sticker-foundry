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
  stickers: [],
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
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace('/api/', ''),
      method = request.method();
    if (path.endsWith('/cover')) {
      await route.fulfill({ status: 404, json: { message: 'No icon yet' } });
      return;
    }
    let body: unknown = {};
    let status = 200;
    if (path === 'auth/refresh') {
      status = 401;
      body = { message: 'Expired' };
    } else if (path === 'instance') body = { instanceName: 'Sticker Foundry' };
    else if (path === 'auth/login') body = { accessToken: 'token', refreshToken: 'refresh', user };
    else if (path === 'auth/me') body = user;
    else if (path === 'packs' && method === 'POST') {
      const p = { ...initial, ...request.postDataJSON(), id: 'new-pack', stickerCount: 0, canExport: false };
      packs.push(p);
      body = p;
    } else if (path === 'packs' || path === 'public/packs') body = packs;
    else if (
      path === 'teams' ||
      path === 'auth/sessions' ||
      path.endsWith('/members') ||
      path.endsWith('/invites') ||
      path.includes('/activity')
    )
      body = [];
    else if (path === 'packs/new-pack' && method === 'PATCH') {
      packs = packs.map((p) => (p.id === 'new-pack' ? { ...p, ...request.postDataJSON() } : p));
      body = packs.find((p) => p.id === 'new-pack');
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
  await fill(page, 'Name', 'Renamed collection');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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

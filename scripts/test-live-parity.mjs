import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Run against a disposable QA stack. Creates three accounts and removes its packs.
// Account IDs are recorded for database cleanup; no credentials are printed or saved.
const base = process.env.LIVE_QA_API;
assert(base, 'Set LIVE_QA_API to the disposable QA API, including /api/');
const run = `parity-${Date.now()}`;
const password = randomUUID() + '!aA1';
const accounts = [],
  packs = [],
  checks = [];
async function api(session, path, method = 'GET', data, expected = 200) {
  const multipart = data instanceof FormData;
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...(!multipart && data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data === undefined ? undefined : multipart ? data : JSON.stringify(data),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  let value;
  try {
    value = JSON.parse(bytes);
  } catch {
    value = bytes;
  }
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value).slice(0, 350)}`);
  return value;
}
async function account(role) {
  const email = `${run}-${role}@example.test`;
  const session = await api(null, 'auth/register', 'POST', { email, displayName: `${run} ${role}`, password }, 201);
  accounts.push({ id: session.user.id, email });
  return session;
}
async function pack(owner, name, extra = {}) {
  const result = await api(owner, 'packs', 'POST', { name: `${run} ${name}`, publisher: 'Parity QA', ...extra }, 201);
  packs.push({ id: result.id, owner });
  return result;
}
async function upload(owner, id, bytes, options = {}, path = 'stickers/jobs', method = 'POST', expected = 202) {
  const data = new FormData();
  data.set('file', new Blob([bytes], { type: 'image/png' }), 'fixture.png');
  for (const [key, value] of Object.entries(options))
    data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  return api(owner, `packs/${id}/${path}`, method, data, expected);
}
async function wait(owner, job, status = 'COMPLETED') {
  const deadline = Date.now() + 180_000;
  while (['QUEUED', 'PROCESSING'].includes(job.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    job = await api(owner, `jobs/${job.id}`);
  }
  assert.equal(job.status, status, `Job ended ${job.status}: ${job.error ?? ''}`);
  return job;
}
function passed(name) {
  checks.push(name);
  console.log(`PASS ${name}`);
}

try {
  const owner = await account('owner'),
    editor = await account('editor'),
    viewer = await account('viewer');
  const team = await api(owner, 'teams', 'POST', { name: run }, 201);
  const member = await api(
    owner,
    `teams/${team.id}/members`,
    'POST',
    { email: accounts[1].email, role: 'EDITOR' },
    201,
  );
  const shared = await pack(owner, 'shared', { teamId: team.id });
  assert.equal((await api(editor, `packs/${shared.id}`)).canEdit, true);
  await api(owner, `teams/${team.id}/members/${member.id}`, 'PATCH', { role: 'VIEWER' });
  assert.equal((await api(editor, `packs/${shared.id}`)).canEdit, false);
  await api(owner, `teams/${team.id}/members/${member.id}`, 'DELETE');
  await api(editor, `packs/${shared.id}`, 'GET', undefined, 403);
  passed('team create, add, demote, remove and access revocation');

  const source = await pack(owner, 'source', { isPublic: true, requiresApproval: true });
  const target = await pack(owner, 'target');
  for (const [session, role, email] of [
    [editor, 'EDITOR', accounts[1].email],
    [viewer, 'VIEWER', accounts[2].email],
  ]) {
    const invite = await api(owner, `packs/${source.id}/invites`, 'POST', { role, email }, 201);
    await api(session, `packs/invites/${invite.code}/accept`, 'POST', undefined, 201);
  }
  await api(viewer, `packs/${source.id}`, 'PATCH', { name: 'forbidden' }, 403);
  await api(editor, `packs/${source.id}`, 'PATCH', { description: 'Forbidden pack metadata' }, 403);
  await api(editor, `packs/${source.id}`, 'PATCH', { isPublic: false }, 403);
  passed('invite acceptance and owner/editor/viewer permissions');

  const images = await Promise.all(
    [0, 1, 2, 3].map((i) =>
      sharp({
        create: {
          width: 96,
          height: 64,
          channels: 4,
          background: { r: 40 + i * 55, g: 180 - i * 40, b: 70 + i * 35, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    ),
  );
  for (let i = 0; i < 3; i++) {
    await wait(
      owner,
      await upload(owner, source.id, images[i], {
        backgroundRemovalMode: i === 0 ? 'ai' : 'none',
        staticQuality: 65,
        emojis: ['🙂'],
        accessibilityText: `Fixture ${i}`,
      }),
    );
  }
  let detail = await api(owner, `packs/${source.id}`);
  assert.equal(detail.stickers.length, 3);
  assert.equal(detail.canExport, false);
  const ids = detail.stickers.map((s) => s.id).reverse();
  await api(editor, `packs/${source.id}/stickers`, 'PATCH', { stickerIds: ids });
  for (const id of ids)
    await api(editor, `packs/${source.id}/stickers/${id}`, 'PATCH', {
      reviewStatus: 'APPROVED',
      emojis: ['✅'],
      accessibilityText: 'Reviewed fixture',
    });
  detail = await api(owner, `packs/${source.id}`);
  assert.deepEqual(
    detail.stickers.map((s) => s.id),
    ids,
  );
  assert.equal(detail.canExport, true);
  const file = await api(viewer, `packs/${source.id}/stickers/${ids[0]}/file`);
  assert.equal((await sharp(file).metadata()).width, 512);
  passed('real worker uploads, AI/fallback, optimizer, order and approval gating');

  const comment = await api(viewer, `packs/${source.id}/stickers/${ids[0]}/comments`, 'POST', { body: 'QA note' }, 201);
  await api(editor, `packs/${source.id}/stickers/${ids[0]}/comments/${comment.id}`, 'DELETE', undefined, 403);
  await api(owner, `packs/${source.id}/stickers/${ids[0]}/comments/${comment.id}`, 'DELETE');
  await upload(owner, source.id, images[3], {}, 'tray-icon', 'POST', 201);
  await api(owner, `packs/${source.id}`, 'PATCH', { name: `${run} saved`, description: 'Saved with tray' });
  const stale = new FormData();
  stale.set('file', new Blob([images[0]], { type: 'image/png' }), 'stale.png');
  const conflict = await fetch(new URL(`packs/${source.id}/tray-icon`, base), {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.accessToken}`, 'If-Match': '0' },
    body: stale,
  });
  assert.equal(conflict.status, 409);
  passed('comment ownership, tray upload, metadata save and stale-version conflict');

  const manifest = await api(owner, `packs/${source.id}/contents`);
  assert.equal(manifest.sticker_packs.length, 1);
  const zip = await api(null, `public/packs/${source.id}/export`);
  assert.equal(zip.readUInt16LE(0), 0x4b50);
  await wait(owner, await api(owner, `packs/${source.id}/export/jobs`, 'POST', {}, 202));
  const clone = await api(viewer, `packs/${source.id}/clone`, 'POST', {}, 201);
  packs.push({ id: clone.id, owner: viewer });
  await api(owner, `packs/${source.id}/stickers/copy`, 'POST', { targetPackId: target.id, stickerIds: [ids[0]] }, 201);
  await api(owner, `packs/${source.id}/stickers/move`, 'POST', { targetPackId: target.id, stickerIds: [ids[1]] }, 201);
  assert.equal((await api(owner, `packs/${target.id}`)).stickers.length, 2);
  const sync = await api(owner, 'sync/packs');
  assert(sync.packs.some((p) => p.id === source.id && p.canExport === false));
  passed('manifest, public ZIP, queued export, clone, copy/move and sync pruning eligibility');

  const animated = await pack(owner, 'animated', { isAnimated: true });
  const frames = await Promise.all(images.slice(0, 3).map((input) => sharp(input).resize(64, 64).png().toBuffer()));
  const animation = await sharp(frames, { join: { animated: true } })
    .webp({ delay: [100, 300, 200] })
    .toBuffer();
  await wait(
    owner,
    await upload(owner, animated.id, animation, {
      animatedTrimStart: 0.1,
      animatedTrimEnd: 0.6,
      animatedFrameRate: 20,
      animatedQuality: 65,
    }),
  );
  const animatedDetail = await api(owner, `packs/${animated.id}`);
  const output = await api(owner, `packs/${animated.id}/stickers/${animatedDetail.stickers[0].id}/file`);
  const info = await sharp(output, { animated: true }).metadata();
  assert(info.pages >= 2);
  assert.equal(info.width, 512);
  passed('animated worker upload, variable timing, trim, FPS and compression');

  const failed = await wait(
    owner,
    await upload(owner, target.id, Buffer.from('invalid PNG'), { backgroundRemovalMode: 'none' }),
    'FAILED',
  );
  await wait(owner, await api(owner, `jobs/${failed.id}/retry`, 'POST', undefined, 201), 'FAILED');
  passed('failed job reporting and retry through the worker');

  const sessions = await api(viewer, 'auth/sessions');
  await api(viewer, `auth/sessions/${sessions[0].id}`, 'DELETE');
  await api(null, 'auth/refresh', 'POST', { refreshToken: viewer.refreshToken }, 401);
  await api(editor, 'auth/password', 'PATCH', { currentPassword: password, newPassword: password + '2' });
  await api(null, 'auth/login', 'POST', { email: accounts[1].email, password: password + '2' }, 201);
  passed('session revocation and password change/login');
} finally {
  for (const entry of packs.reverse()) {
    try {
      await api(entry.owner, `packs/${entry.id}`, 'DELETE');
    } catch (error) {
      console.error(`Cleanup ${entry.id}: ${error.message}`);
    }
  }
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/${run}.json`, JSON.stringify({ run, checks, accounts }, null, 2));
  await writeFile('test-results/live-parity.json', JSON.stringify({ run, checks, accounts }, null, 2));
}

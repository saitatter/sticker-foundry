import { Archive, Download, Eye, EyeOff, Globe2, KeyRound, Lock } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  type AuthResponse,
  type InstanceSettings,
  type Pack,
  type StickerFoundryApi,
} from './api';
import { BrandMark } from './components/layout/brand-mark';
import { Button } from './components/ui/button';
import { LabeledIconButton as IconButton } from './components/ui/labeled-icon-button';
import { Metric } from './components/ui/metric';
import { NoticeBar } from './components/ui/notice-bar';
import { downloadBlob, exportFileName } from './lib/download';
import type { Notice } from './ui-types';
import { Card } from './components/ui/card';
import { Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';

const DEMO_EMAIL = 'demo@stickerfoundry.local';
const DEMO_PASSWORD = 'stickerfoundry123';

export function SharePage({
  api,
  instanceSettings,
  packId,
  onError,
  notice,
}: {
  api: StickerFoundryApi;
  instanceSettings: InstanceSettings;
  packId: string;
  onError: (error: unknown) => void;
  notice: Notice | null;
}) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.publicPack(packId).then(setPack).catch(onError);
  }, [api, onError, packId]);

  async function download() {
    if (!pack) return;
    setDownloading(true);
    try {
      const blob = await api.publicExportPack(pack.id);
      downloadBlob(blob, exportFileName(pack));
    } catch (error) {
      onError(error);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="share-layout">
      <Card className="share-panel">
        <div className="brand share-brand">
          <BrandMark />
          <div>
            <h1>{instanceSettings.instanceName}</h1>
            <p>{instanceSettings.instanceDescription}</p>
          </div>
        </div>
        {notice ? <NoticeBar notice={notice} /> : null}
        {pack ? (
          <>
            <div className="share-heading">
              <p className="eyebrow">Public sticker pack</p>
              <h2>{pack.name}</h2>
              <p>{pack.publisher}</p>
            </div>
            <div className="stats-grid">
              <Metric label="Stickers" value={`${pack.exportStickerCount ?? pack.stickerCount}/30`} />
              <Metric label="Visibility" value="Public" />
              <Metric label="Version" value={pack.imageDataVersion} />
              <Metric label="Updated" value={new Date(pack.updatedAt).toLocaleDateString()} />
            </div>
            <div className="share-steps">
              <span>Download the ZIP from this page.</span>
              <span>Import through the Sticker Foundry Android app for WhatsApp.</span>
              <span>WhatsApp will ask for confirmation before adding the pack.</span>
            </div>
            <Button
              disabled={!pack.canExport || downloading}
              onClick={() => void download()}
              type="button"
            >
              <Download size={17} />
              {downloading ? 'Downloading' : 'Download ZIP'}
            </Button>
          </>
        ) : (
          <div className="empty-inline">
            <Archive size={22} />
            <span>Loading public pack</span>
          </div>
        )}
      </Card>
    </main>
  );
}

export function AuthScreen({
  api,
  instanceSettings,
  onSignedIn,
  onError,
  onNotice,
  notice,
}: {
  api: StickerFoundryApi;
  instanceSettings: InstanceSettings;
  onSignedIn: (auth: AuthResponse) => void;
  onError: (error: unknown) => void;
  onNotice: (notice: Notice) => void;
  notice: Notice | null;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestingReset, setRequestingReset] = useState(false);
  const [publicPacks, setPublicPacks] = useState<Pack[]>([]);
  const [loadingPublicPacks, setLoadingPublicPacks] = useState(false);
  const [showPublicPacks, setShowPublicPacks] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response =
        mode === 'register'
          ? await api.register(email, displayName || email.split('@')[0], password, inviteCode)
          : await api.login(email, password);
      onSignedIn(response);
    } catch (error) {
      onError(error);
    } finally {
      setSubmitting(false);
    }
  }

  function useDemoCredentials() {
    setMode('login');
    setEmail(DEMO_EMAIL);
    setDisplayName('');
    setInviteCode('');
    setPassword(DEMO_PASSWORD);
  }

  async function requestPasswordReset() {
    if (!email.trim()) {
      onNotice({ tone: 'error', text: 'Enter your email first.' });
      return;
    }
    setRequestingReset(true);
    try {
      await api.requestPasswordReset(email);
      onNotice({ tone: 'success', text: 'If that account exists, a reset link has been sent.' });
    } catch (error) {
      onError(error);
    } finally {
      setRequestingReset(false);
    }
  }

  async function browsePublicPacks() {
    setShowPublicPacks(true);
    setLoadingPublicPacks(true);
    try {
      setPublicPacks(await api.publicPacks());
    } catch (error) {
      onError(error);
    } finally {
      setLoadingPublicPacks(false);
    }
  }

  return (
    <main className="auth-layout">
      <Card className="auth-panel">
        <div className="brand auth-brand">
          <BrandMark />
          <div>
            <h1>{instanceSettings.instanceName}</h1>
            <p>{instanceSettings.instanceDescription}</p>
          </div>
        </div>

        <Tabs className="segmented" aria-label="Authentication mode">
          <TabsList>
            <TabsTrigger aria-selected={mode === 'login'} onClick={() => setMode('login')}>
            Login
            </TabsTrigger>
            <TabsTrigger aria-selected={mode === 'register'} onClick={() => setMode('register')}>
            Register
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button className="secondary-button demo-login-button" onClick={useDemoCredentials} type="button" variant="secondary">
          <KeyRound size={17} />
          Use demo account
        </Button>

        {notice ? <NoticeBar notice={notice} /> : null}

        <form className="form-grid" onSubmit={submit}>
          <Field label="Email" htmlFor="auth-email">
            <Input id="auth-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </Field>
          {mode === 'register' ? (
            <Field label="Display name" htmlFor="auth-display-name">
              <Input id="auth-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </Field>
          ) : null}
          {mode === 'register' ? (
            <Field label="Invite code" htmlFor="auth-invite-code">
              <Input id="auth-invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
            </Field>
          ) : null}
          <Field label="Password" htmlFor="auth-password">
            <span className="password-field">
              <Input
                id="auth-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                required
              />
              <IconButton
                label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconButton>
            </span>
          </Field>
          <Button disabled={submitting} type="submit">
            <Lock size={17} />
            {mode === 'register' ? 'Create account' : 'Login'}
          </Button>
          {mode === 'login' ? (
            <Button
              disabled={requestingReset}
              onClick={() => void requestPasswordReset()}
              type="button"
              variant="secondary"
            >
              <KeyRound size={17} />
              {requestingReset ? 'Sending reset' : 'Email reset link'}
            </Button>
          ) : null}
        </form>
        <div className="public-pack-browser">
          <Button
            disabled={loadingPublicPacks}
            onClick={() => void browsePublicPacks()}
            type="button"
            variant="secondary"
          >
            <Globe2 size={17} />
            {loadingPublicPacks ? 'Loading public packs' : 'Browse public packs'}
          </Button>
          {showPublicPacks ? (
            <div className="public-pack-list">
              {publicPacks.length > 0 ? (
                publicPacks.map((pack) => (
                  <Link className="public-pack-link" params={{ packId: pack.id }} to="/share/$packId" key={pack.id}>
                    <span>
                      <strong>{pack.name}</strong>
                      <small>{pack.publisher}</small>
                    </span>
                    <small>{pack.exportStickerCount ?? pack.stickerCount}/30</small>
                  </Link>
                ))
              ) : (
                <div className="empty-inline">
                  <Archive size={20} />
                  <span>{loadingPublicPacks ? 'Loading public packs' : 'No public packs yet'}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </Card>
    </main>
  );
}

export function ResetPasswordScreen({
  api,
  instanceSettings,
  token,
  onChanged,
  onError,
  notice,
}: {
  api: StickerFoundryApi;
  instanceSettings: InstanceSettings;
  token: string;
  onChanged: () => void;
  onError: (error: unknown) => void;
  notice: Notice | null;
}) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <Card className="auth-panel">
        <div className="brand auth-brand">
          <BrandMark />
          <div>
            <h1>{instanceSettings.instanceName}</h1>
            <p>Choose a new password</p>
          </div>
        </div>

        {notice ? <NoticeBar notice={notice} /> : null}

        <form className="form-grid" onSubmit={submit}>
          <Field label="New password" htmlFor="reset-password">
            <Input
              id="reset-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </Field>
          <Button disabled={submitting} type="submit">
            <Lock size={17} />
            {submitting ? 'Saving' : 'Reset password'}
          </Button>
        </form>
      </Card>
    </main>
  );
}

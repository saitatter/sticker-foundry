import {
  ArrowDown,
  ArrowUp,
  Archive,
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eraser,
  Eye,
  EyeOff,
  FileJson,
  Film,
  Globe2,
  GripVertical,
  ImagePlus,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  MoveRight,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Undo2,
  UserPlus,
  Users,
} from 'lucide-react';
import { type Dispatch, type DragEvent, type FormEvent, type PointerEvent, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdminSettings,
  AnimatedStickerOptions,
  ApiError,
  BackgroundRemovalUploadOptions,
  AuditLogEntry,
  AuthResponse,
  InstanceSettings,
  Pack,
  PackInvite,
  PackMember,
  PackRole,
  RegistrationMode,
  Sticker,
  StickerComment,
  StickerFoundryApi,
  StickerUploadOptions,
  Team,
  TeamMember,
  User,
  UserSession,
} from './api';

const TOKEN_KEY = 'stickerfoundry.token';
const REFRESH_TOKEN_KEY = 'stickerfoundry.refreshToken';
const DEMO_EMAIL = 'demo@stickerfoundry.local';
const DEMO_PASSWORD = 'stickerfoundry123';
const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  instanceName: 'StickerFoundry',
  instanceDescription: 'Self-hosted sticker pack management',
};

type Notice = {
  tone: 'info' | 'error' | 'success';
  text: string;
};

type PackFilter = 'all' | 'public' | 'private' | 'ready' | 'needs-work';
type PackSort = 'updated' | 'name' | 'stickers';

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem(REFRESH_TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [instanceSettings, setInstanceSettings] = useState<InstanceSettings>(DEFAULT_INSTANCE_SETTINGS);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [backgroundRemovalStatus, setBackgroundRemovalStatus] = useState<AdminSettings['backgroundRemoval'] | undefined>(undefined);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const passwordResetToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname === '/reset-password' ? params.get('token') : null;
  }, []);

  const saveAuth = useCallback((auth: AuthResponse | null) => {
    if (!auth) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      return;
    }

    localStorage.setItem(TOKEN_KEY, auth.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
    setToken(auth.accessToken);
    setRefreshToken(auth.refreshToken);
    setUser(auth.user);
  }, []);

  const api = useMemo(() => new StickerFoundryApi(() => token, () => refreshToken, saveAuth), [refreshToken, saveAuth, token]);

  const reportError = useCallback((error: unknown) => {
    const text = error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong';
    setNotice({ tone: 'error', text });
  }, []);

  const refreshPacks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [nextPacks, nextTeams] = await Promise.all([api.packs(), api.teams()]);
      setPacks(nextPacks);
      setTeams(nextTeams);
      setSelectedPackId((current) => current ?? nextPacks[0]?.id ?? null);
    } catch (error) {
      reportError(error);
    } finally {
      setLoading(false);
    }
  }, [api, reportError, token]);

  const refreshSelectedPack = useCallback(async () => {
    if (!selectedPackId) {
      setSelectedPack(null);
      return;
    }
    try {
      setSelectedPack(await api.pack(selectedPackId));
    } catch (error) {
      reportError(error);
    }
  }, [api, reportError, selectedPackId]);

  useEffect(() => {
    api.instanceSettings().then(setInstanceSettings).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (!token) return;
    api
      .me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setToken(null);
        setRefreshToken(null);
      });
  }, [api, token]);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  useEffect(() => {
    if (!user?.isAdmin) {
      setBackgroundRemovalStatus(undefined);
      return;
    }
    api.adminSettings().then((settings) => setBackgroundRemovalStatus(settings.backgroundRemoval)).catch(reportError);
  }, [api, reportError, user?.isAdmin]);

  useEffect(() => {
    void refreshSelectedPack();
  }, [refreshSelectedPack]);

  const sharePackId = sharePackIdFromPath();
  if (sharePackId) {
    return <SharePage api={api} instanceSettings={instanceSettings} packId={sharePackId} onError={reportError} notice={notice} />;
  }

  const saveSession = (auth: AuthResponse) => {
    saveAuth(auth);
    setNotice({ tone: 'success', text: 'Signed in' });
  };

  const signOut = () => {
    const tokenToRevoke = refreshToken;
    if (tokenToRevoke) {
      void api.logout(tokenToRevoke).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setPacks([]);
    setSelectedPack(null);
    setSelectedPackId(null);
    setBackgroundRemovalStatus(undefined);
  };

  if (!token) {
    if (passwordResetToken) {
      return (
        <ResetPasswordScreen
          api={api}
          instanceSettings={instanceSettings}
          token={passwordResetToken}
          onChanged={() => {
            window.history.replaceState(null, '', '/');
            setNotice({ tone: 'success', text: 'Password reset complete. You can log in now.' });
          }}
          onError={reportError}
          notice={notice}
        />
      );
    }

    return (
      <AuthScreen
        api={api}
        instanceSettings={instanceSettings}
        onSignedIn={saveSession}
        onError={reportError}
        onNotice={setNotice}
        notice={notice}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SF</span>
          <div>
            <h1>{instanceSettings.instanceName}</h1>
            <p>{user?.email ?? 'Signed in'}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <IconButton label="Account settings" onClick={() => setShowAccountDialog(true)}>
            <KeyRound size={18} />
          </IconButton>
          <IconButton label="Refresh packs" onClick={() => void refreshPacks()}>
            <RefreshCw size={18} />
          </IconButton>
          <IconButton label="Sign out" onClick={signOut}>
            <LogOut size={18} />
          </IconButton>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <PackCreateForm
            api={api}
            teams={teams}
            onCreated={(pack) => {
              setPacks((current) => [pack, ...current]);
              setSelectedPackId(pack.id);
              setNotice({ tone: 'success', text: 'Pack created' });
            }}
            onError={reportError}
          />

          <TeamCreateForm
            api={api}
            onCreated={async (team) => {
              setTeams((current) => [team, ...current].sort((left, right) => left.name.localeCompare(right.name)));
              setNotice({ tone: 'success', text: 'Team created' });
            }}
            onError={reportError}
          />

          <TeamWorkspacePanel
            api={api}
            teams={teams}
            onChanged={refreshPacks}
            onError={reportError}
            onNotice={(message) => setNotice({ tone: 'success', text: message })}
          />

          <AcceptInviteForm
            api={api}
            onAccepted={async (pack) => {
              await refreshPacks();
              setSelectedPackId(pack.id);
              setNotice({ tone: 'success', text: 'Invite accepted' });
            }}
            onError={reportError}
          />

          <PackList
            packs={packs}
            selectedPackId={selectedPackId}
            loading={loading}
            onSelect={setSelectedPackId}
          />
        </aside>

        <main className="content">
          {notice ? <NoticeBar notice={notice} onClose={() => setNotice(null)} /> : null}
          {selectedPack ? (
            <PackDetail
              api={api}
              backgroundRemovalStatus={backgroundRemovalStatus}
              pack={selectedPack}
              packs={packs}
              onChanged={async (message) => {
                await refreshPacks();
                await refreshSelectedPack();
                setNotice({ tone: 'success', text: message });
              }}
              onDeleted={() => {
                setPacks((current) => current.filter((pack) => pack.id !== selectedPack.id));
                setSelectedPackId(packs.find((pack) => pack.id !== selectedPack.id)?.id ?? null);
                setSelectedPack(null);
                setNotice({ tone: 'success', text: 'Pack deleted' });
              }}
              onCloned={(pack) => {
                setPacks((current) => [pack, ...current]);
                setSelectedPackId(pack.id);
                setNotice({ tone: 'success', text: 'Pack cloned' });
              }}
              onError={reportError}
              onNotice={(message) => setNotice({ tone: 'success', text: message })}
            />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
      {showAccountDialog ? (
        <AccountDialog
          api={api}
          isAdmin={Boolean(user?.isAdmin)}
          instanceSettings={instanceSettings}
          onClose={() => setShowAccountDialog(false)}
          onChanged={(message, settings) => {
            if (settings) setInstanceSettings(settings);
            setNotice({ tone: 'success', text: message });
          }}
          onError={reportError}
        />
      ) : null}
    </div>
  );
}

function SharePage({
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
      <section className="share-panel">
        <div className="brand share-brand">
          <span className="brand-mark">SF</span>
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
              <span>Import through the StickerFoundry Android app for WhatsApp.</span>
              <span>WhatsApp will ask for confirmation before adding the pack.</span>
            </div>
            <button className="primary-button" disabled={!pack.canExport || downloading} onClick={() => void download()} type="button">
              <Download size={17} />
              {downloading ? 'Downloading' : 'Download ZIP'}
            </button>
          </>
        ) : (
          <div className="empty-inline">
            <Archive size={22} />
            <span>Loading public pack</span>
          </div>
        )}
      </section>
    </main>
  );
}

function AccountDialog({
  api,
  isAdmin,
  instanceSettings,
  onClose,
  onChanged,
  onError,
}: {
  api: StickerFoundryApi;
  isAdmin: boolean;
  instanceSettings: InstanceSettings;
  onClose: () => void;
  onChanged: (message: string, settings?: InstanceSettings) => void;
  onError: (error: unknown) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [saving, setSaving] = useState(false);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('open');
  const [registrationInviteCode, setRegistrationInviteCode] = useState('');
  const [storageQuotaMb, setStorageQuotaMb] = useState('');
  const [auditRetentionDays, setAuditRetentionDays] = useState('');
  const [instanceName, setInstanceName] = useState(instanceSettings.instanceName);
  const [instanceDescription, setInstanceDescription] = useState(instanceSettings.instanceDescription);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [exportingAudit, setExportingAudit] = useState(false);

  useEffect(() => {
    api.sessions().then(setSessions).catch(onError);
  }, [api, onError]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .adminSettings()
      .then((settings) => {
        setAdminSettings(settings);
        setRegistrationMode(settings.registrationMode);
        setRegistrationInviteCode(settings.registrationInviteCode ?? '');
        setStorageQuotaMb(settings.storageQuotaBytes ? String(Math.round(settings.storageQuotaBytes / 1024 / 1024)) : '');
        setAuditRetentionDays(settings.auditRetentionDays ? String(settings.auditRetentionDays) : '');
        setInstanceName(settings.instanceName);
        setInstanceDescription(settings.instanceDescription);
      })
      .catch(onError);
    api.adminAuditLog().then(setAuditLog).catch(onError);
  }, [api, isAdmin, onError]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      onChanged('Password changed');
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(id: string) {
    try {
      await api.revokeSession(id);
      setSessions((current) => current.map((session) => (session.id === id ? { ...session, revokedAt: new Date().toISOString() } : session)));
    } catch (error) {
      onError(error);
    }
  }

  async function revokeAllSessions() {
    try {
      await api.revokeAllSessions();
      const revokedAt = new Date().toISOString();
      setSessions((current) => current.map((session) => ({ ...session, revokedAt: session.revokedAt ?? revokedAt })));
    } catch (error) {
      onError(error);
    }
  }

  async function saveAdminSettings(event: FormEvent) {
    event.preventDefault();
    const trimmedQuota = storageQuotaMb.trim();
    const quotaNumber = trimmedQuota ? Number(trimmedQuota) : null;
    const trimmedAuditRetention = auditRetentionDays.trim();
    const auditRetentionNumber = trimmedAuditRetention ? Number(trimmedAuditRetention) : null;
    if (quotaNumber !== null && (!Number.isFinite(quotaNumber) || quotaNumber <= 0)) {
      onError(new Error('Storage quota must be a positive number of MB'));
      return;
    }
    if (auditRetentionNumber !== null && (!Number.isFinite(auditRetentionNumber) || auditRetentionNumber <= 0)) {
      onError(new Error('Audit retention must be a positive number of days'));
      return;
    }

    setSavingAdmin(true);
    try {
      const settings = await api.updateAdminSettings({
        registrationMode,
        registrationInviteCode: registrationInviteCode.trim() || null,
        storageQuotaBytes: quotaNumber === null ? null : Math.round(quotaNumber * 1024 * 1024),
        auditRetentionDays: auditRetentionNumber === null ? null : Math.round(auditRetentionNumber),
        instanceName: instanceName.trim() || DEFAULT_INSTANCE_SETTINGS.instanceName,
        instanceDescription: instanceDescription.trim() || DEFAULT_INSTANCE_SETTINGS.instanceDescription,
      });
      setAdminSettings(settings);
      setRegistrationMode(settings.registrationMode);
      setRegistrationInviteCode(settings.registrationInviteCode ?? '');
      setStorageQuotaMb(settings.storageQuotaBytes ? String(Math.round(settings.storageQuotaBytes / 1024 / 1024)) : '');
      setAuditRetentionDays(settings.auditRetentionDays ? String(settings.auditRetentionDays) : '');
      setInstanceName(settings.instanceName);
      setInstanceDescription(settings.instanceDescription);
      setAuditLog(await api.adminAuditLog());
      onChanged('Admin settings saved', {
        instanceName: settings.instanceName,
        instanceDescription: settings.instanceDescription,
      });
    } catch (error) {
      onError(error);
    } finally {
      setSavingAdmin(false);
    }
  }

  async function exportAuditLog() {
    setExportingAudit(true);
    try {
      const blob = await api.exportAuditLog();
      downloadBlob(blob, `stickerfoundry-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      onError(error);
    } finally {
      setExportingAudit(false);
    }
  }

  async function cleanupAuditLog() {
    try {
      const result = await api.cleanupAuditLog();
      setAuditLog(await api.adminAuditLog());
      onChanged(`Audit cleanup deleted ${result.deleted} entr${result.deleted === 1 ? 'y' : 'ies'}`);
    } catch (error) {
      onError(error);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel form-grid">
        <div className="section-heading">
          <h2>Account</h2>
          <button className="secondary-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Current password
            <input
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              required
            />
          </label>
          <label>
            New password
            <input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
          <button className="primary-button" disabled={saving} type="submit">
            <KeyRound size={17} />
            {saving ? 'Saving' : 'Change password'}
          </button>
        </form>
        <div className="session-list">
          <div className="section-heading">
            <h3>Sessions</h3>
            <button className="secondary-button danger-button" onClick={() => void revokeAllSessions()} type="button">
              Revoke all
            </button>
          </div>
          {sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <span>
                <strong>{session.revokedAt ? 'Revoked' : 'Active'}</strong>
                <small>Expires {new Date(session.expiresAt).toLocaleDateString()}</small>
              </span>
              <button
                className="secondary-button danger-button"
                disabled={Boolean(session.revokedAt)}
                onClick={() => void revokeSession(session.id)}
                type="button"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
        {isAdmin ? (
          <form className="admin-settings form-grid" onSubmit={saveAdminSettings}>
            <div className="section-heading">
              <h3>Admin settings</h3>
              <ShieldCheck size={18} />
            </div>
            {adminSettings ? (
              <div className="admin-status-row">
                <span>
                  <strong>Background removal</strong>
                  <small>
                    Threshold ready ·{' '}
                    {adminSettings.backgroundRemoval.aiCommandConfigured
                      ? 'AI command configured'
                      : 'AI fallback only'}
                  </small>
                </span>
                <span className={adminSettings.backgroundRemoval.aiCommandConfigured ? 'status-pill ready' : 'status-pill warning'}>
                  {adminSettings.backgroundRemoval.aiCommandConfigured ? 'AI ready' : 'Threshold fallback'}
                </span>
              </div>
            ) : null}
            <label>
              Instance name
              <input
                maxLength={80}
                value={instanceName}
                onChange={(event) => setInstanceName(event.target.value)}
              />
            </label>
            <label>
              Instance description
              <input
                maxLength={160}
                value={instanceDescription}
                onChange={(event) => setInstanceDescription(event.target.value)}
              />
            </label>
            <label>
              Registration
              <select value={registrationMode} onChange={(event) => setRegistrationMode(event.target.value as RegistrationMode)}>
                <option value="open">Open</option>
                <option value="invite-only">Invite only</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label>
              Invite code
              <input
                disabled={registrationMode !== 'invite-only'}
                value={registrationInviteCode}
                onChange={(event) => setRegistrationInviteCode(event.target.value)}
              />
            </label>
            <label>
              Storage quota per owner (MB)
              <input
                min="1"
                placeholder="Unlimited"
                type="number"
                value={storageQuotaMb}
                onChange={(event) => setStorageQuotaMb(event.target.value)}
              />
            </label>
            <label>
              Audit retention (days)
              <input
                min="1"
                placeholder="Keep forever"
                type="number"
                value={auditRetentionDays}
                onChange={(event) => setAuditRetentionDays(event.target.value)}
              />
            </label>
            <button className="secondary-button" disabled={savingAdmin || !adminSettings} type="submit">
              <ShieldCheck size={17} />
              {savingAdmin ? 'Saving' : 'Save admin settings'}
            </button>
          </form>
        ) : null}
        {isAdmin ? (
          <div className="audit-list">
            <div className="section-heading">
              <h3>Audit log</h3>
              <button className="secondary-button" disabled={exportingAudit} onClick={() => void exportAuditLog()} type="button">
                <Download size={17} />
                {exportingAudit ? 'Exporting' : 'Export CSV'}
              </button>
              <button className="secondary-button" onClick={() => void cleanupAuditLog()} type="button">
                <Trash2 size={17} />
                Cleanup
              </button>
            </div>
            {auditLog.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <span>
                  <strong>{auditActionLabel(entry.action)}</strong>
                  <small>{entry.actor?.email ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}</small>
                </span>
                <small>{entry.entityType}</small>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AuthScreen({
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
      <section className="auth-panel">
        <div className="brand auth-brand">
          <span className="brand-mark">SF</span>
          <div>
            <h1>{instanceSettings.instanceName}</h1>
            <p>{instanceSettings.instanceDescription}</p>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">
            Login
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} type="button">
            Register
          </button>
        </div>

        <button className="secondary-button demo-login-button" onClick={useDemoCredentials} type="button">
          <KeyRound size={17} />
          Use demo account
        </button>

        {notice ? <NoticeBar notice={notice} /> : null}

        <form className="form-grid" onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          {mode === 'register' ? (
            <label>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
          ) : null}
          {mode === 'register' ? (
            <label>
              Invite code
              <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
            </label>
          ) : null}
          <label>
            Password
            <span className="password-field">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                required
              />
              <IconButton label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </IconButton>
            </span>
          </label>
          <button className="primary-button" disabled={submitting} type="submit">
            <Lock size={17} />
            {mode === 'register' ? 'Create account' : 'Login'}
          </button>
          {mode === 'login' ? (
            <button className="secondary-button" disabled={requestingReset} onClick={() => void requestPasswordReset()} type="button">
              <KeyRound size={17} />
              {requestingReset ? 'Sending reset' : 'Email reset link'}
            </button>
          ) : null}
        </form>
        <div className="public-pack-browser">
          <button className="secondary-button" disabled={loadingPublicPacks} onClick={() => void browsePublicPacks()} type="button">
            <Globe2 size={17} />
            {loadingPublicPacks ? 'Loading public packs' : 'Browse public packs'}
          </button>
          {showPublicPacks ? (
            <div className="public-pack-list">
              {publicPacks.length > 0 ? (
                publicPacks.map((pack) => (
                  <a className="public-pack-link" href={`/share/${pack.id}`} key={pack.id}>
                    <span>
                      <strong>{pack.name}</strong>
                      <small>{pack.publisher}</small>
                    </span>
                    <small>{pack.exportStickerCount ?? pack.stickerCount}/30</small>
                  </a>
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
      </section>
    </main>
  );
}

function ResetPasswordScreen({
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
      <section className="auth-panel">
        <div className="brand auth-brand">
          <span className="brand-mark">SF</span>
          <div>
            <h1>{instanceSettings.instanceName}</h1>
            <p>Choose a new password</p>
          </div>
        </div>

        {notice ? <NoticeBar notice={notice} /> : null}

        <form className="form-grid" onSubmit={submit}>
          <label>
            New password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required />
          </label>
          <button className="primary-button" disabled={submitting} type="submit">
            <Lock size={17} />
            {submitting ? 'Saving' : 'Reset password'}
          </button>
        </form>
      </section>
    </main>
  );
}

function PackCreateForm({
  api,
  teams,
  onCreated,
  onError,
}: {
  api: StickerFoundryApi;
  teams: Team[];
  onCreated: (pack: Pack) => void;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState('');
  const [publisher, setPublisher] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isAnimated, setIsAnimated] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const pack = await api.createPack({ name, publisher, isPublic, requiresApproval, isAnimated, teamId: teamId || undefined });
      setName('');
      setPublisher('');
      setIsPublic(false);
      setRequiresApproval(false);
      setIsAnimated(false);
      setTeamId('');
      onCreated(pack);
    } catch (error) {
      onError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="tool-panel">
      <div className="section-heading">
        <h2>New pack</h2>
        <Plus size={18} />
      </div>
      <form className="form-grid compact" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required />
        </label>
        <label>
          Publisher
          <input value={publisher} onChange={(event) => setPublisher(event.target.value)} maxLength={128} required />
        </label>
        <label className="checkbox-row">
          <input checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} type="checkbox" />
          Public
        </label>
        <label className="checkbox-row">
          <input
            checked={requiresApproval}
            onChange={(event) => setRequiresApproval(event.target.checked)}
            type="checkbox"
          />
          Require approval
        </label>
        <label className="checkbox-row">
          <input checked={isAnimated} onChange={(event) => setIsAnimated(event.target.checked)} type="checkbox" />
          Animated pack
        </label>
        {teams.length > 0 ? (
          <label>
            Team
            <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">Personal</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="primary-button" disabled={submitting} type="submit">
          <Plus size={17} />
          Create
        </button>
      </form>
    </section>
  );
}

function TeamCreateForm({
  api,
  onCreated,
  onError,
}: {
  api: StickerFoundryApi;
  onCreated: (team: Team) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const team = await api.createTeam(name, description.trim() || undefined);
      setName('');
      setDescription('');
      await onCreated(team);
    } catch (error) {
      onError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="tool-panel">
      <div className="section-heading">
        <h2>New team</h2>
        <Users size={18} />
      </div>
      <form className="form-grid compact" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required />
        </label>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </label>
        <button className="secondary-button" disabled={submitting} type="submit">
          <Users size={17} />
          Create team
        </button>
      </form>
    </section>
  );
}

function TeamWorkspacePanel({
  api,
  teams,
  onChanged,
  onError,
  onNotice,
}: {
  api: StickerFoundryApi;
  teams: Team[];
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
}) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<PackRole, 'OWNER'>>('EDITOR');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0];

  useEffect(() => {
    if (!teams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(teams[0]?.id ?? '');
    }
  }, [selectedTeamId, teams]);

  useEffect(() => {
    if (!selectedTeam?.canManage) {
      setMembers([]);
      return;
    }

    let alive = true;
    setLoading(true);
    api
      .teamMembers(selectedTeam.id)
      .then((nextMembers) => {
        if (alive) setMembers(nextMembers);
      })
      .catch(onError)
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [api, onError, selectedTeam]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!selectedTeam) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setSaving(true);
    try {
      const member = await api.addTeamMember(selectedTeam.id, trimmedEmail, role);
      setMembers((current) => [member, ...current.filter((item) => item.id !== member.id)]);
      setEmail('');
      await onChanged();
      onNotice('Team member added');
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function changeMemberRole(memberId: string, nextRole: Exclude<PackRole, 'OWNER'>) {
    if (!selectedTeam) return;
    try {
      const member = await api.updateTeamMember(selectedTeam.id, memberId, nextRole);
      setMembers((current) => current.map((item) => (item.id === member.id ? member : item)));
      await onChanged();
      onNotice('Team role updated');
    } catch (error) {
      onError(error);
    }
  }

  async function removeMember(memberId: string) {
    if (!selectedTeam || !confirm('Remove this member from the team?')) return;
    try {
      await api.removeTeamMember(selectedTeam.id, memberId);
      setMembers((current) => current.filter((member) => member.id !== memberId));
      await onChanged();
      onNotice('Team member removed');
    } catch (error) {
      onError(error);
    }
  }

  if (teams.length === 0) return null;

  return (
    <section className="tool-panel team-panel">
      <div className="section-heading">
        <h2>Teams</h2>
        <Users size={18} />
      </div>
      <div className="team-list">
        {teams.map((team) => (
          <button
            className={`team-row ${team.id === selectedTeam?.id ? 'selected' : ''}`}
            key={team.id}
            onClick={() => setSelectedTeamId(team.id)}
            type="button"
          >
            <span>
              <strong>{team.name}</strong>
              <small>{team.memberCount} members · {team.packCount} packs</small>
            </span>
            <span className="status-pill">{roleLabel(team.role)}</span>
          </button>
        ))}
      </div>
      {selectedTeam?.canManage ? (
        <>
          <form className="form-grid compact team-member-form" onSubmit={addMember}>
            <label>
              Member email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label>
              Role
              <select value={role} onChange={(event) => setRole(event.target.value as Exclude<PackRole, 'OWNER'>)}>
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Viewer</option>
              </select>
            </label>
            <button className="secondary-button" disabled={saving || !email.trim()} type="submit">
              <UserPlus size={17} />
              Add member
            </button>
          </form>
          <div className="member-list compact-member-list">
            {loading ? <span className="muted-row">Loading team members</span> : null}
            {members.map((member) => (
              <div className="member-row" key={member.id}>
                <span>
                  <strong>{member.user.displayName}</strong>
                  <small>{member.user.email}</small>
                </span>
                {member.role === 'OWNER' ? (
                  <span className="status-pill">{roleLabel(member.role)}</span>
                ) : (
                  <span className="member-actions">
                    <select
                      aria-label={`Role for ${member.user.email}`}
                      value={member.role}
                      onChange={(event) => void changeMemberRole(member.id, event.target.value as Exclude<PackRole, 'OWNER'>)}
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                    <IconButton label="Remove team member" onClick={() => void removeMember(member.id)} danger>
                      <Trash2 size={16} />
                    </IconButton>
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      ) : selectedTeam ? (
        <span className="muted-row">You can use this team for shared packs.</span>
      ) : null}
    </section>
  );
}

function AcceptInviteForm({
  api,
  onAccepted,
  onError,
}: {
  api: StickerFoundryApi;
  onAccepted: (pack: Pack) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const inviteCode = code.trim();
    if (!inviteCode) return;

    setSubmitting(true);
    try {
      const pack = await api.acceptPackInvite(inviteCode);
      setCode('');
      await onAccepted(pack);
    } catch (error) {
      onError(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="tool-panel">
      <div className="section-heading">
        <h2>Join pack</h2>
        <UserPlus size={18} />
      </div>
      <form className="form-grid compact" onSubmit={submit}>
        <label>
          Invite code
          <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" />
        </label>
        <button className="secondary-button" disabled={!code.trim() || submitting} type="submit">
          <UserPlus size={17} />
          Join
        </button>
      </form>
    </section>
  );
}

function PackList({
  packs,
  selectedPackId,
  loading,
  onSelect,
}: {
  packs: Pack[];
  selectedPackId: string | null;
  loading: boolean;
  onSelect: (packId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PackFilter>('all');
  const [sort, setSort] = useState<PackSort>('updated');
  const visiblePacks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return packs
      .filter((pack) => {
        if (normalizedQuery) {
          const haystack = `${pack.name} ${pack.publisher} ${pack.description ?? ''}`.toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        if (filter === 'public') return pack.isPublic;
        if (filter === 'private') return !pack.isPublic;
        if (filter === 'ready') return pack.stickerCount >= 3;
        if (filter === 'needs-work') return pack.stickerCount < 3;
        return true;
      })
      .sort((left, right) => {
        if (sort === 'name') return left.name.localeCompare(right.name);
        if (sort === 'stickers') return right.stickerCount - left.stickerCount || left.name.localeCompare(right.name);
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [filter, packs, query, sort]);

  return (
    <section className="pack-list" aria-label="Sticker packs">
      <div className="section-heading">
        <h2>Packs</h2>
        <span className="counter">{loading ? '...' : visiblePacks.length}</span>
      </div>
      <div className="pack-list-tools">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Search packs"
            placeholder="Search packs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="pack-list-selects">
          <select aria-label="Filter packs" value={filter} onChange={(event) => setFilter(event.target.value as PackFilter)}>
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="ready">Ready</option>
            <option value="needs-work">Needs work</option>
          </select>
          <select aria-label="Sort packs" value={sort} onChange={(event) => setSort(event.target.value as PackSort)}>
            <option value="updated">Updated</option>
            <option value="name">Name</option>
            <option value="stickers">Stickers</option>
          </select>
        </div>
      </div>
      <div className="pack-list-scroll">
        {visiblePacks.length === 0 && !loading ? (
          <div className="empty-pack-list">
            <Archive size={22} />
            <span>{packs.length === 0 ? 'No packs' : 'No packs match the current filters'}</span>
          </div>
        ) : null}
        {visiblePacks.map((pack) => (
          <button
            className={`pack-row ${pack.id === selectedPackId ? 'selected' : ''}`}
            key={pack.id}
            onClick={() => onSelect(pack.id)}
            type="button"
          >
            <span className="pack-row-main">
              <strong>{pack.name}</strong>
              <span>{pack.publisher}</span>
              {pack.teamName ? <span>{pack.teamName}</span> : null}
            </span>
            <span className="pack-row-meta">
              <span className={`status-pill ${pack.isPublic ? 'public' : 'private'}`}>
                {pack.isPublic ? <Globe2 size={13} /> : <Lock size={13} />}
                {pack.isPublic ? 'Public' : 'Private'}
              </span>
              <span className={`status-pill ${pack.stickerCount >= 3 ? 'ready' : 'needs-work'}`}>
                {pack.stickerCount >= 3 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {pack.stickerCount}/30
              </span>
              {pack.isAnimated ? (
                <span className="status-pill pending">
                  <Film size={13} />
                  Animated
                </span>
              ) : null}
              {pack.role ? <span className="status-pill">{roleLabel(pack.role)}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PackDetail({
  api,
  backgroundRemovalStatus,
  pack,
  packs,
  onChanged,
  onDeleted,
  onCloned,
  onError,
  onNotice,
}: {
  api: StickerFoundryApi;
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
  pack: Pack;
  packs: Pack[];
  onChanged: (message: string) => Promise<void>;
  onDeleted: () => void;
  onCloned: (pack: Pack) => void;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
}) {
  const [optimisticStickers, setOptimisticStickers] = useState<Sticker[] | null>(null);
  const stickers = optimisticStickers ?? pack.stickers ?? [];
  const exportStickerCount =
    pack.requiresApproval ? stickers.filter((sticker) => sticker.reviewStatus === 'APPROVED').length : stickers.length;
  const canEdit = pack.canEdit ?? true;
  const canManage = pack.canManage ?? false;
  const canExport = exportStickerCount >= 3 && exportStickerCount <= 30;
  const [exporting, setExporting] = useState(false);
  const [contentsPreview, setContentsPreview] = useState<string | null>(null);
  const [loadingContents, setLoadingContents] = useState(false);
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(null);
  const [selectedStickerIds, setSelectedStickerIds] = useState<string[]>([]);
  const [bulkEmojis, setBulkEmojis] = useState('');
  const [bulkTargetPackId, setBulkTargetPackId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const selectedStickerSet = useMemo(() => new Set(selectedStickerIds), [selectedStickerIds]);
  const transferTargets = packs.filter((item) => item.canEdit && item.id !== pack.id);

  useEffect(() => {
    setSelectedStickerIds([]);
    setBulkEmojis('');
    setBulkTargetPackId('');
    setOptimisticStickers(null);
  }, [pack.id]);

  useEffect(() => {
    setOptimisticStickers(null);
  }, [pack.imageDataVersion]);

  async function exportPack() {
    setExporting(true);
    try {
      const blob = await api.exportPack(pack.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(pack);
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onNotice('Export ZIP downloaded');
    } catch (error) {
      onError(error);
    } finally {
      setExporting(false);
    }
  }

  async function deletePack() {
    if (!confirm(`Delete "${pack.name}"?`)) return;
    try {
      await api.deletePack(pack.id);
      onDeleted();
    } catch (error) {
      onError(error);
    }
  }

  async function clonePack() {
    try {
      onCloned(await api.clonePack(pack.id));
    } catch (error) {
      onError(error);
    }
  }

  async function previewContents() {
    if (contentsPreview) {
      setContentsPreview(null);
      return;
    }

    setLoadingContents(true);
    try {
      const contents = await api.exportContents(pack.id);
      setContentsPreview(JSON.stringify(contents, null, 2));
    } catch (error) {
      onError(error);
    } finally {
      setLoadingContents(false);
    }
  }

  async function moveSticker(stickerId: string, direction: -1 | 1) {
    const currentIndex = stickers.findIndex((sticker) => sticker.id === stickerId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stickers.length) return;

    const nextOrder = stickers.map((sticker) => sticker.id);
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
    const nextStickers = [...stickers];
    [nextStickers[currentIndex], nextStickers[nextIndex]] = [nextStickers[nextIndex], nextStickers[currentIndex]];
    setOptimisticStickers(nextStickers);

    try {
      await api.reorderStickers(pack.id, nextOrder);
      await onChanged('Sticker order updated');
    } catch (error) {
      setOptimisticStickers(null);
      onError(error);
    }
  }

  async function reorderStickerTo(targetStickerId: string) {
    if (!draggingStickerId || draggingStickerId === targetStickerId) return;

    const currentIndex = stickers.findIndex((sticker) => sticker.id === draggingStickerId);
    const targetIndex = stickers.findIndex((sticker) => sticker.id === targetStickerId);
    if (currentIndex < 0 || targetIndex < 0) return;

    const nextOrder = stickers.map((sticker) => sticker.id);
    const [movedStickerId] = nextOrder.splice(currentIndex, 1);
    const insertIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextOrder.splice(insertIndex, 0, movedStickerId);
    const nextStickers = nextOrder
      .map((id) => stickers.find((sticker) => sticker.id === id))
      .filter((sticker): sticker is Sticker => Boolean(sticker));
    setOptimisticStickers(nextStickers);

    try {
      await api.reorderStickers(pack.id, nextOrder);
      await onChanged('Sticker order updated');
    } catch (error) {
      setOptimisticStickers(null);
      onError(error);
    } finally {
      setDraggingStickerId(null);
    }
  }

  function toggleStickerSelection(stickerId: string, selected: boolean) {
    setSelectedStickerIds((current) => {
      if (selected) return current.includes(stickerId) ? current : [...current, stickerId];
      return current.filter((id) => id !== stickerId);
    });
  }

  function selectRelativeSticker(direction: -1 | 1) {
    if (stickers.length === 0) return;
    setSelectedStickerIds((current) => {
      const activeId = current[current.length - 1];
      const activeIndex = activeId ? stickers.findIndex((sticker) => sticker.id === activeId) : -1;
      const nextIndex =
        activeIndex < 0
          ? direction > 0
            ? 0
            : stickers.length - 1
          : Math.max(0, Math.min(stickers.length - 1, activeIndex + direction));
      return [stickers[nextIndex].id];
    });
  }

  function selectAllStickers() {
    setSelectedStickerIds(stickers.map((sticker) => sticker.id));
  }

  async function reviewSelectedStickers(reviewStatus: Sticker['reviewStatus']) {
    if (selectedStickerIds.length === 0 || bulkSaving) return;
    const selectedStickers = stickers.filter((sticker) => selectedStickerIds.includes(sticker.id));
    if (selectedStickers.length === 0) return;

    setBulkSaving(true);
    setOptimisticStickers(
      stickers.map((sticker) => (selectedStickerIds.includes(sticker.id) ? { ...sticker, reviewStatus } : sticker)),
    );
    try {
      for (const sticker of selectedStickers) {
        await api.updateSticker(pack.id, sticker.id, sticker.emojis, sticker.accessibilityText ?? '', reviewStatus);
      }
      await onChanged('Review status updated');
    } catch (error) {
      setOptimisticStickers(null);
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkDeleteStickers() {
    if (selectedStickerIds.length === 0 || !confirm(`Delete ${selectedStickerIds.length} selected sticker(s)?`)) return;
    setBulkSaving(true);
    try {
      for (const stickerId of selectedStickerIds) {
        await api.deleteSticker(pack.id, stickerId);
      }
      setSelectedStickerIds([]);
      await onChanged('Selected stickers deleted');
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkApplyEmojis() {
    const emojis = bulkEmojis
      .split(',')
      .map((emoji) => emoji.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (selectedStickerIds.length === 0 || emojis.length === 0) return;

    setBulkSaving(true);
    try {
      for (const sticker of stickers.filter((item) => selectedStickerIds.includes(item.id))) {
        await api.updateSticker(pack.id, sticker.id, emojis, sticker.accessibilityText ?? '');
      }
      setSelectedStickerIds([]);
      setBulkEmojis('');
      await onChanged('Emoji updated on selected stickers');
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkGenerateAltText() {
    if (selectedStickerIds.length === 0) return;

    setBulkSaving(true);
    try {
      for (const sticker of stickers.filter((item) => selectedStickerIds.includes(item.id))) {
        await api.updateSticker(
          pack.id,
          sticker.id,
          sticker.emojis,
          generatedAltText(pack, sticker),
          sticker.reviewStatus,
        );
      }
      setSelectedStickerIds([]);
      await onChanged('Alt text generated for selected stickers');
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkTransferStickers(mode: 'copy' | 'move') {
    if (selectedStickerIds.length === 0 || !bulkTargetPackId) return;

    setBulkSaving(true);
    try {
      if (mode === 'copy') {
        await api.copyStickers(pack.id, bulkTargetPackId, selectedStickerIds);
        await onChanged('Selected stickers copied');
      } else {
        await api.moveStickers(pack.id, bulkTargetPackId, selectedStickerIds);
        setSelectedStickerIds([]);
        await onChanged('Selected stickers moved');
      }
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  useEffect(() => {
    if (!canEdit) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.repeat && key !== 'j' && key !== 'k') return;

      if (key === 'escape') {
        setSelectedStickerIds([]);
        return;
      }
      if (key === 'j') {
        event.preventDefault();
        selectRelativeSticker(1);
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        selectRelativeSticker(-1);
        return;
      }
      if (selectedStickerIds.length === 0) return;
      if (key === 'a') {
        event.preventDefault();
        void reviewSelectedStickers('APPROVED');
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        void reviewSelectedStickers('PENDING');
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        void reviewSelectedStickers('NEEDS_WORK');
        return;
      }
      if (event.shiftKey && selectedStickerIds.length === 1 && event.key === 'ArrowUp') {
        event.preventDefault();
        void moveSticker(selectedStickerIds[0], -1);
        return;
      }
      if (event.shiftKey && selectedStickerIds.length === 1 && event.key === 'ArrowDown') {
        event.preventDefault();
        void moveSticker(selectedStickerIds[0], 1);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <section className="detail">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{pack.isPublic ? 'Public pack' : 'Private pack'}</p>
          <h2>{pack.name}</h2>
          <p>{pack.publisher}</p>
        </div>
        <div className="detail-actions">
          <button className="secondary-button" disabled={!canExport || loadingContents} onClick={() => void previewContents()} type="button">
            <FileJson size={17} />
            {contentsPreview ? 'Hide JSON' : 'Preview JSON'}
          </button>
          <button className="secondary-button" disabled={!canExport || exporting} onClick={() => void exportPack()} type="button">
            <Download size={17} />
            {exporting ? 'Exporting' : 'Download ZIP'}
          </button>
          <button className="secondary-button" onClick={() => void clonePack()} type="button">
            <Copy size={17} />
            Clone
          </button>
          {canManage ? (
            <IconButton label="Delete pack" onClick={() => void deletePack()} danger>
              <Trash2 size={18} />
            </IconButton>
          ) : null}
        </div>
      </div>

      <div className="stats-grid">
        <Metric label="Stickers" value={`${stickers.length}/30`} />
        <Metric label="Export" value={`${exportStickerCount}/30`} />
        <Metric label="Format" value={pack.isAnimated ? 'Animated' : 'Static'} />
        <Metric label="Role" value={roleLabel(pack.role)} />
        <Metric label="Version" value={pack.imageDataVersion} />
        <Metric label="Updated" value={new Date(pack.updatedAt).toLocaleDateString()} />
      </div>

      <ExportReadiness
        stickerCount={exportStickerCount}
        canExport={canExport}
        requiresApproval={pack.requiresApproval}
        isAnimated={pack.isAnimated}
      />

      {contentsPreview ? <pre className="contents-preview">{contentsPreview}</pre> : null}

      {canManage ? <CollaborationPanel api={api} pack={pack} onChanged={onChanged} onError={onError} onNotice={onNotice} /> : null}

      <ActivityPanel api={api} pack={pack} onError={onError} />

      {canManage ? <PackEditForm api={api} pack={pack} onChanged={onChanged} onError={onError} /> : null}

      {canEdit ? <TrayIconPanel api={api} pack={pack} onChanged={onChanged} onError={onError} /> : null}

      {canEdit ? (
        <UploadPanel
          api={api}
          backgroundRemovalStatus={backgroundRemovalStatus}
          pack={pack}
          remainingSlots={Math.max(0, 30 - stickers.length)}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}

      <section className="stickers-section">
        <div className="section-heading">
          <h3>Stickers</h3>
          <Archive size={18} />
        </div>
        {canEdit && stickers.length > 0 ? (
          <div className="bulk-toolbar">
            <span className="counter">{selectedStickerIds.length}</span>
            <button className="secondary-button" disabled={bulkSaving} onClick={selectAllStickers} type="button">
              Select all
            </button>
            <button
              className="secondary-button"
              disabled={selectedStickerIds.length === 0 || bulkSaving}
              onClick={() => setSelectedStickerIds([])}
              type="button"
            >
              Clear
            </button>
            <label>
              Emojis
              <input value={bulkEmojis} onChange={(event) => setBulkEmojis(event.target.value)} placeholder="smile,laugh" />
            </label>
            <button
              className="secondary-button"
              disabled={selectedStickerIds.length === 0 || !bulkEmojis.trim() || bulkSaving}
              onClick={() => void bulkApplyEmojis()}
              type="button"
            >
              Apply emoji
            </button>
            <button
              className="secondary-button"
              disabled={selectedStickerIds.length === 0 || bulkSaving}
              onClick={() => void bulkGenerateAltText()}
              type="button"
            >
              Generate alt
            </button>
            <button
              className="secondary-button danger-button"
              disabled={selectedStickerIds.length === 0 || bulkSaving}
              onClick={() => void bulkDeleteStickers()}
              type="button"
            >
              Delete selected
            </button>
            <label>
              Target
              <select
                disabled={transferTargets.length === 0}
                value={bulkTargetPackId}
                onChange={(event) => setBulkTargetPackId(event.target.value)}
              >
                <option value="">Choose pack</option>
                {transferTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name} ({target.stickerCount}/30)
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary-button"
              disabled={selectedStickerIds.length === 0 || !bulkTargetPackId || bulkSaving}
              onClick={() => void bulkTransferStickers('copy')}
              type="button"
            >
              Copy
            </button>
            <button
              className="secondary-button"
              disabled={selectedStickerIds.length === 0 || !bulkTargetPackId || bulkSaving}
              onClick={() => void bulkTransferStickers('move')}
              type="button"
            >
              Move
            </button>
          </div>
        ) : null}
        {stickers.length > 0 ? (
          <div className="sticker-grid">
            {stickers.map((sticker, index) => (
              <StickerTile
                api={api}
                isAnimatedPack={pack.isAnimated}
                key={sticker.id}
                packId={pack.id}
                transferTargets={transferTargets}
                sticker={sticker}
                version={pack.imageDataVersion}
                canEdit={canEdit}
                canMoveDown={index < stickers.length - 1}
                canMoveUp={index > 0}
                isDragging={draggingStickerId === sticker.id}
                isSelected={selectedStickerSet.has(sticker.id)}
                onChanged={() => onChanged('Sticker updated')}
                onDeleted={() => onChanged('Sticker deleted')}
                onDragEnd={() => setDraggingStickerId(null)}
                onDragStart={() => setDraggingStickerId(sticker.id)}
                onDrop={() => void reorderStickerTo(sticker.id)}
                onError={onError}
                onMoveDown={() => moveSticker(sticker.id, 1)}
                onMoveUp={() => moveSticker(sticker.id, -1)}
                onSelectedChange={(selected) => toggleStickerSelection(sticker.id, selected)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-inline">
            <ImagePlus size={22} />
            <span>No stickers yet</span>
          </div>
        )}
      </section>
    </section>
  );
}

function ActivityPanel({
  api,
  pack,
  onError,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  onError: (error: unknown) => void;
}) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .packActivity(pack.id)
      .then((nextEntries) => {
        if (alive) setEntries(nextEntries);
      })
      .catch(onError)
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [api, onError, pack.id]);

  return (
    <section className="activity-panel">
      <div className="section-heading">
        <h3>Activity</h3>
        <Archive size={18} />
      </div>
      <div className="activity-list">
        {loading ? <span className="muted-row">Loading activity</span> : null}
        {entries.map((entry) => (
          <div className="activity-row" key={entry.id}>
            <span>
              <strong>{auditActionLabel(entry.action)}</strong>
              <small>{entry.actor?.email ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}</small>
            </span>
            <small>{entry.entityType}</small>
          </div>
        ))}
        {!loading && entries.length === 0 ? <span className="muted-row">No activity yet.</span> : null}
      </div>
    </section>
  );
}

function ExportReadiness({
  stickerCount,
  canExport,
  requiresApproval,
  isAnimated,
}: {
  stickerCount: number;
  canExport: boolean;
  requiresApproval: boolean;
  isAnimated: boolean;
}) {
  const missing = Math.max(0, 3 - stickerCount);

  return (
    <section className={`export-panel ${canExport ? 'ready' : 'blocked'}`}>
      <div className="export-status">
        {canExport ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        <div>
          <h3>{canExport ? 'WhatsApp export ready' : 'WhatsApp export blocked'}</h3>
          <p>
            {canExport
              ? `${requiresApproval ? 'Approved stickers' : 'Ordered stickers'} are included in the ${isAnimated ? 'animated' : 'static'} contents.json and ZIP.`
              : `${missing} more ${requiresApproval ? 'approved ' : ''}sticker${missing === 1 ? '' : 's'} needed for this ${isAnimated ? 'animated' : 'static'} pack.`}
          </p>
        </div>
      </div>
      <span className="export-count">{stickerCount}/30</span>
    </section>
  );
}

function CollaborationPanel({
  api,
  pack,
  onError,
  onNotice,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  onChanged: (message: string) => Promise<void>;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
}) {
  const [members, setMembers] = useState<PackMember[]>([]);
  const [invites, setInvites] = useState<PackInvite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<PackRole, 'OWNER'>>('EDITOR');
  const [expiresAt, setExpiresAt] = useState('');
  const [inviteFilter, setInviteFilter] = useState<'all' | 'pending' | 'accepted' | 'expired'>('all');
  const [invite, setInvite] = useState<PackInvite | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const visibleInvites = invites.filter((item) => {
    if (inviteFilter === 'pending') return !item.acceptedAt && !isExpiredInvite(item);
    if (inviteFilter === 'accepted') return Boolean(item.acceptedAt);
    if (inviteFilter === 'expired') return isExpiredInvite(item);
    return true;
  });

  const loadCollaboration = useCallback(async () => {
    setLoading(true);
    try {
      const [nextMembers, nextInvites] = await Promise.all([api.packMembers(pack.id), api.packInvites(pack.id)]);
      setMembers(nextMembers);
      setInvites(nextInvites);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [api, onError, pack.id]);

  useEffect(() => {
    void loadCollaboration();
  }, [loadCollaboration]);

  async function createInvite(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const inviteExpiry = expiresAt ? new Date(expiresAt).toISOString() : undefined;
      const nextInvite = await api.createPackInvite(pack.id, role, email, inviteExpiry);
      setInvite(nextInvite);
      setInvites((current) => [nextInvite, ...current]);
      setEmail('');
      setExpiresAt('');
      onNotice('Invite created');
    } catch (error) {
      onError(error);
    } finally {
      setCreating(false);
    }
  }

  async function copyInviteCode() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      onNotice('Invite code copied');
    } catch {
      onNotice('Invite code ready');
    }
  }

  async function changeMemberRole(memberId: string, nextRole: Exclude<PackRole, 'OWNER'>) {
    try {
      const updated = await api.updatePackMember(pack.id, memberId, nextRole);
      setMembers((current) => current.map((member) => (member.id === memberId ? updated : member)));
      onNotice('Member role updated');
    } catch (error) {
      onError(error);
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm('Remove this member from the pack?')) return;
    try {
      await api.removePackMember(pack.id, memberId);
      setMembers((current) => current.filter((member) => member.id !== memberId));
      onNotice('Member removed');
    } catch (error) {
      onError(error);
    }
  }

  async function revokeInvite(inviteId: string) {
    try {
      await api.revokePackInvite(pack.id, inviteId);
      setInvites((current) => current.filter((item) => item.id !== inviteId));
      if (invite?.id === inviteId) setInvite(null);
      onNotice('Invite revoked');
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="collaboration-panel">
      <div className="section-heading">
        <h3>Collaboration</h3>
        <Users size={18} />
      </div>
      <div className="collaboration-grid">
        <div className="member-list">
          {loading ? <span className="muted-row">Loading members</span> : null}
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <span>
                <strong>{member.user.displayName}</strong>
                <small>{member.user.email}</small>
              </span>
              <span className="member-actions">
                <select
                  aria-label={`Role for ${member.user.email}`}
                  value={member.role}
                  onChange={(event) => void changeMemberRole(member.id, event.target.value as Exclude<PackRole, 'OWNER'>)}
                >
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <IconButton label="Remove member" onClick={() => void removeMember(member.id)} danger>
                  <Trash2 size={16} />
                </IconButton>
              </span>
            </div>
          ))}
          {!loading && members.length === 0 ? <span className="muted-row">Only the owner has access right now.</span> : null}
        </div>
        <form className="invite-form" onSubmit={createInvite}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="optional@email.com" type="email" />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as Exclude<PackRole, 'OWNER'>)}>
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>
          <label>
            Expires
            <input value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} type="datetime-local" />
          </label>
          <button className="secondary-button" disabled={creating} type="submit">
            <UserPlus size={17} />
            Invite
          </button>
          {invite ? (
            <button className="invite-code-button" onClick={() => void copyInviteCode()} type="button">
              <span>{invite.code}</span>
            </button>
          ) : null}
        </form>
        <div className="invite-list">
          <div className="invite-filter-row">
            <select value={inviteFilter} onChange={(event) => setInviteFilter(event.target.value as typeof inviteFilter)}>
              <option value="all">All invites</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="expired">Expired</option>
            </select>
            <span className="counter">{visibleInvites.length}</span>
          </div>
          {visibleInvites.map((item) => (
            <div className="invite-row" key={item.id}>
              <span>
                <strong>{item.email ?? 'Open invite'}</strong>
                <small>{inviteStatusLabel(item)}</small>
              </span>
              {item.acceptedAt ? (
                <span className="status-pill ready">Accepted</span>
              ) : isExpiredInvite(item) ? (
                <span className="status-pill needs-work">Expired</span>
              ) : (
                <IconButton label="Revoke invite" onClick={() => void revokeInvite(item.id)} danger>
                  <Trash2 size={16} />
                </IconButton>
              )}
            </div>
          ))}
          {!loading && visibleInvites.length === 0 ? <span className="muted-row">No invites match this filter.</span> : null}
        </div>
      </div>
    </section>
  );
}

function PackEditForm({
  api,
  pack,
  onChanged,
  onError,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  onChanged: (message: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState(pack.name);
  const [publisher, setPublisher] = useState(pack.publisher);
  const [description, setDescription] = useState(pack.description ?? '');
  const [isPublic, setIsPublic] = useState(pack.isPublic);
  const [requiresApproval, setRequiresApproval] = useState(pack.requiresApproval);
  const [isAnimated, setIsAnimated] = useState(pack.isAnimated);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(pack.name);
    setPublisher(pack.publisher);
    setDescription(pack.description ?? '');
    setIsPublic(pack.isPublic);
    setRequiresApproval(pack.requiresApproval);
    setIsAnimated(pack.isAnimated);
  }, [pack.description, pack.isAnimated, pack.isPublic, pack.name, pack.publisher, pack.requiresApproval]);

  const dirty =
    name !== pack.name ||
    publisher !== pack.publisher ||
    description !== (pack.description ?? '') ||
    isPublic !== pack.isPublic ||
    requiresApproval !== pack.requiresApproval ||
    isAnimated !== pack.isAnimated;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updatePack(pack.id, {
        name,
        publisher,
        description,
        isPublic,
        requiresApproval,
        isAnimated,
      });
      await onChanged('Pack updated');
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="edit-panel">
      <div className="section-heading">
        <h3>Details</h3>
        <Edit3 size={18} />
      </div>
      <form className="edit-form" onSubmit={submit}>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required />
        </label>
        <label>
          Publisher
          <input value={publisher} onChange={(event) => setPublisher(event.target.value)} maxLength={128} required />
        </label>
        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </label>
        <label className="checkbox-row edit-toggle">
          <input checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} type="checkbox" />
          Public
        </label>
        <label className="checkbox-row edit-toggle">
          <input
            checked={requiresApproval}
            onChange={(event) => setRequiresApproval(event.target.checked)}
            type="checkbox"
          />
          Require approval
        </label>
        <label className="checkbox-row edit-toggle">
          <input checked={isAnimated} onChange={(event) => setIsAnimated(event.target.checked)} type="checkbox" />
          Animated pack
        </label>
        <button className="secondary-button" disabled={!dirty || saving} type="submit">
          <Edit3 size={17} />
          Save
        </button>
      </form>
    </section>
  );
}

function TrayIconPanel({
  api,
  pack,
  onChanged,
  onError,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  onChanged: (message: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    api
      .trayIconBlob(pack.id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, pack.id, pack.imageDataVersion]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadTrayIcon(pack.id, file);
      setFile(null);
      await onChanged('Tray icon updated');
    } catch (error) {
      onError(error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="tray-panel">
      <div className="section-heading">
        <h3>Tray icon</h3>
        <ImagePlus size={18} />
      </div>
      <form className="tray-form" onSubmit={submit}>
        <div className="tray-preview" aria-label="Current tray icon">
          {url ? <img alt={`${pack.name} tray icon`} src={url} /> : <ImagePlus size={24} />}
        </div>
        <label className="file-drop compact-drop">
          <input accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
          <ImagePlus size={20} />
          <span>{file ? file.name : 'Choose tray image'}</span>
        </label>
        <button className="secondary-button" disabled={!file || uploading} type="submit">
          <Upload size={17} />
          Replace
        </button>
      </form>
    </section>
  );
}

function UploadPanel({
  api,
  pack,
  remainingSlots,
  onChanged,
  onError,
  backgroundRemovalStatus,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  remainingSlots: number;
  onChanged: (message: string) => Promise<void>;
  onError: (error: unknown) => void;
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [editOptions, setEditOptions] = useState<ImageEditOptions>(defaultImageEditOptions);
  const [emojis, setEmojis] = useState('');
  const [accessibilityText, setAccessibilityText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<ImageEditOptions>(defaultImageEditOptions);
  const disabled = remainingSlots <= 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setUploadedCount(0);
    try {
      const uploadEmojis = emojis
        .split(',')
        .map((emoji) => emoji.trim())
        .filter(Boolean)
        .slice(0, 3);

      for (const [index, file] of files.entries()) {
        const uploadFile = await editableUploadFile(file, pack.isAnimated, editOptions);
        await api.uploadSticker(pack.id, uploadFile, uploadEmojis, accessibilityText, stickerUploadOptionsFromEdit(file, pack.isAnimated, editOptions));
        setUploadedCount(index + 1);
      }

      const count = files.length;
      setFiles([]);
      setEditOptions(defaultImageEditOptions);
      setEmojis('');
      setAccessibilityText('');
      await onChanged(count === 1 ? 'Sticker uploaded' : `${count} stickers uploaded`);
    } catch (error) {
      onError(error);
    } finally {
      setUploading(false);
      setUploadedCount(0);
    }
  }

  function chooseFiles(fileList: FileList | null) {
    const selected = Array.from(fileList ?? []).slice(0, remainingSlots);
    setFiles(selected);
    setEditorOpen(false);
    setEditOptions(defaultImageEditOptions);
    setEditorDraft(defaultImageEditOptions);
  }

  function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsFileDragActive(false);
    if (disabled) return;
    chooseFiles(event.dataTransfer.files);
  }

  const fileLabel =
    files.length === 0
      ? disabled
        ? 'Pack is full'
        : 'Choose images'
      : files.length === 1
        ? files[0].name
        : `${files.length} images selected`;

  return (
    <section className="upload-panel">
      <div className="section-heading">
        <h3>Upload</h3>
        <span className="counter">{remainingSlots}</span>
      </div>
      <form className="upload-form" onSubmit={submit}>
        <label
          className={`file-drop ${isFileDragActive ? 'drag-active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsFileDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsFileDragActive(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropFiles}
        >
          <input
            accept="image/*"
            disabled={disabled}
            multiple
            onChange={(event) => chooseFiles(event.target.files)}
            type="file"
          />
          <ImagePlus size={22} />
          <span>{fileLabel}</span>
        </label>
        <label>
          Emojis
          <input value={emojis} onChange={(event) => setEmojis(event.target.value)} placeholder="smile,laugh" />
        </label>
        <label>
          Alt text
          <input value={accessibilityText} onChange={(event) => setAccessibilityText(event.target.value)} maxLength={125} />
        </label>
        <button className="primary-button" disabled={files.length === 0 || disabled || uploading} type="submit">
          <Upload size={17} />
          {uploading ? `Uploading ${uploadedCount}/${files.length}` : 'Upload'}
        </button>
      </form>
      {files[0] ? (
        <UploadEditSummary
          file={files[0]}
          fileCount={files.length}
          isAnimatedPack={pack.isAnimated}
          options={editOptions}
          onEdit={() => {
            setEditorDraft(cloneImageEditOptions(editOptions));
            setEditorOpen(true);
          }}
          onReset={() => setEditOptions(defaultImageEditOptions)}
        />
      ) : null}
      {editorOpen && files[0] ? (
        <ImageEditModal
          backgroundRemovalStatus={backgroundRemovalStatus}
          file={files[0]}
          options={editorDraft}
          onChange={setEditorDraft}
          onApply={() => {
            setEditOptions(cloneImageEditOptions(editorDraft));
            setEditorOpen(false);
          }}
          onClose={() => setEditorOpen(false)}
          onReset={() => setEditorDraft(defaultImageEditOptions)}
        />
      ) : null}
      {files.length > 1 ? <p className="upload-note">Current edit settings and presets apply to all selected files in upload order.</p> : null}
    </section>
  );
}

function UploadEditSummary({
  file,
  fileCount,
  isAnimatedPack,
  options,
  onEdit,
  onReset,
}: {
  file: File;
  fileCount: number;
  isAnimatedPack: boolean;
  options: ImageEditOptions;
  onEdit: () => void;
  onReset: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const badges = imageEditBadges(options, file, isAnimatedPack);
  const hasEdits = badges[0] !== 'Original image';

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="upload-edit-summary">
      <div className="upload-edit-preview">
        {previewUrl ? <img alt="Selected upload preview" src={previewUrl} /> : <ImagePlus size={24} />}
      </div>
      <div className="upload-edit-copy">
        <strong>{fileCount === 1 ? file.name : `${fileCount} images selected`}</strong>
        <div className="upload-edit-badges">
          {badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      </div>
      <button className="secondary-button" onClick={onEdit} type="button">
        <Edit3 size={17} />
        Edit
      </button>
      <button className="ghost-button" disabled={!hasEdits} onClick={onReset} type="button">
        Reset
      </button>
    </div>
  );
}

function ImageEditModal({
  backgroundRemovalStatus,
  file,
  options,
  onChange,
  onApply,
  onClose,
  onReset,
}: {
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
  file: File;
  options: ImageEditOptions;
  onChange: Dispatch<SetStateAction<ImageEditOptions>>;
  onApply: () => void;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <div className="modal-backdrop image-editor-backdrop">
      <section aria-label="Sticker image editor" aria-modal="true" className="modal-panel image-editor-modal" role="dialog">
        <header className="image-editor-header">
          <div>
            <h3>Edit Sticker</h3>
            <p>{file.name}</p>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Cancel
          </button>
        </header>
        <ImageEditControls
          backgroundRemovalStatus={backgroundRemovalStatus}
          file={file}
          modal
          options={options}
          onChange={onChange}
        />
        <footer className="image-editor-footer">
          <button className="ghost-button" onClick={onReset} type="button">
            Reset edits
          </button>
          <div>
            <button className="secondary-button" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" onClick={onApply} type="button">
              Apply edits
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function StickerTile({
  api,
  isAnimatedPack,
  packId,
  transferTargets,
  sticker,
  version,
  canEdit,
  canMoveDown,
  canMoveUp,
  isDragging,
  isSelected,
  onChanged,
  onDeleted,
  onDragEnd,
  onDragStart,
  onDrop,
  onError,
  onMoveDown,
  onMoveUp,
  onSelectedChange,
}: {
  api: StickerFoundryApi;
  isAnimatedPack: boolean;
  packId: string;
  transferTargets: Pack[];
  sticker: Sticker;
  version: string;
  canEdit: boolean;
  canMoveDown: boolean;
  canMoveUp: boolean;
  isDragging: boolean;
  isSelected: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onError: (error: unknown) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onSelectedChange: (selected: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [emojis, setEmojis] = useState(sticker.emojis.join(','));
  const [accessibilityText, setAccessibilityText] = useState(sticker.accessibilityText ?? '');
  const [reviewStatus, setReviewStatus] = useState(sticker.reviewStatus);
  const [saving, setSaving] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementEditOptions, setReplacementEditOptions] = useState<ImageEditOptions>(defaultImageEditOptions);
  const [replacing, setReplacing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<StickerComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [transferTargetPackId, setTransferTargetPackId] = useState('');

  useEffect(() => {
    setEmojis(sticker.emojis.join(','));
    setAccessibilityText(sticker.accessibilityText ?? '');
    setReviewStatus(sticker.reviewStatus);
  }, [sticker.accessibilityText, sticker.emojis, sticker.reviewStatus]);

  useEffect(() => {
    setTransferTargetPackId('');
  }, [packId, sticker.id]);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    api
      .stickerBlob(packId, sticker.id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(onError);

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, onError, packId, sticker.id, version]);

  async function deleteSticker() {
    try {
      await api.deleteSticker(packId, sticker.id);
      await onDeleted();
    } catch (error) {
      onError(error);
    }
  }

  async function saveMetadata(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateSticker(
        packId,
        sticker.id,
        emojis
          .split(',')
          .map((emoji) => emoji.trim())
          .filter(Boolean)
          .slice(0, 3),
        accessibilityText.trim(),
        reviewStatus,
      );
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function replaceImage(event: FormEvent) {
    event.preventDefault();
    if (!replacementFile) return;
    setReplacing(true);
    try {
      const editedFile = await editableUploadFile(replacementFile, isAnimatedPack, replacementEditOptions);
      await api.replaceStickerImage(
        packId,
        sticker.id,
        editedFile,
        stickerUploadOptionsFromEdit(replacementFile, isAnimatedPack, replacementEditOptions),
      );
      setReplacementFile(null);
      setReplacementEditOptions(defaultImageEditOptions);
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setReplacing(false);
    }
  }

  async function toggleComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (!nextOpen || comments.length > 0) return;
    setCommentsLoading(true);
    try {
      setComments(await api.stickerComments(packId, sticker.id));
    } catch (error) {
      onError(error);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    const body = commentBody.trim();
    if (!body) return;
    setCommentSaving(true);
    try {
      const comment = await api.createStickerComment(packId, sticker.id, body);
      setComments((current) => [...current, comment]);
      setCommentBody('');
    } catch (error) {
      onError(error);
    } finally {
      setCommentSaving(false);
    }
  }

  async function deleteComment(commentId: string) {
    try {
      await api.deleteStickerComment(packId, sticker.id, commentId);
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (error) {
      onError(error);
    }
  }

  async function transferSticker(mode: 'copy' | 'move') {
    if (!transferTargetPackId) return;
    try {
      if (mode === 'copy') {
        await api.copyStickers(packId, transferTargetPackId, [sticker.id]);
      } else {
        await api.moveStickers(packId, transferTargetPackId, [sticker.id]);
      }
      setTransferTargetPackId('');
      await onChanged();
    } catch (error) {
      onError(error);
    }
  }

  function renderTransferControls() {
    if (!canEdit || transferTargets.length === 0) return null;
    return (
      <div className="sticker-transfer-form">
        <label>
          Target pack
          <select value={transferTargetPackId} onChange={(event) => setTransferTargetPackId(event.target.value)}>
            <option value="">Choose pack</option>
            {transferTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} ({target.stickerCount}/30)
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" disabled={!transferTargetPackId} onClick={() => void transferSticker('copy')} type="button">
          <Copy size={16} />
          Copy
        </button>
        <button className="secondary-button" disabled={!transferTargetPackId} onClick={() => void transferSticker('move')} type="button">
          <MoveRight size={16} />
          Move
        </button>
      </div>
    );
  }

  const dirty =
    emojis !== sticker.emojis.join(',') ||
    accessibilityText !== (sticker.accessibilityText ?? '') ||
    reviewStatus !== sticker.reviewStatus;

  return (
    <article
      className={`sticker-tile ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      draggable={canEdit}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      {canEdit ? (
        <>
          <span className="sticker-drag-handle" aria-hidden="true">
            <GripVertical size={16} />
          </span>
          <div className="sticker-order-actions">
            <IconButton label="Move sticker up" onClick={onMoveUp} disabled={!canMoveUp}>
              <ArrowUp size={15} />
            </IconButton>
            <IconButton label="Move sticker down" onClick={onMoveDown} disabled={!canMoveDown}>
              <ArrowDown size={15} />
            </IconButton>
          </div>
        </>
      ) : null}
      {canEdit ? (
        <label className="sticker-select">
          <input checked={isSelected} onChange={(event) => onSelectedChange(event.target.checked)} type="checkbox" />
          Select
        </label>
      ) : null}
      <button className="sticker-preview sticker-preview-button" onClick={() => setDetailOpen(true)} type="button">
        {url ? <img alt={sticker.accessibilityText ?? sticker.fileName} src={url} /> : null}
        <span>
          <Eye size={16} />
        </span>
      </button>
      <div className="sticker-meta">
        <span>{formatBytes(sticker.sizeBytes)}</span>
        <span>{sticker.emojis.join(' ') || 'No emoji'}</span>
      </div>
      <span className={`status-pill ${reviewStatusClass(sticker.reviewStatus)}`}>{reviewStatusLabel(sticker.reviewStatus)}</span>
      <button className="secondary-button sticker-comments-toggle" onClick={() => void toggleComments()} type="button">
        <MessageSquare size={16} />
        Comments
      </button>
      {commentsOpen ? (
        <div className="sticker-comments">
          {commentsLoading ? <span className="muted-row">Loading comments</span> : null}
          {comments.map((comment) => (
            <div className="comment-row" key={comment.id}>
              <span>
                <strong>{comment.user.displayName}</strong>
                <small>{new Date(comment.createdAt).toLocaleDateString()}</small>
                <p>{comment.body}</p>
              </span>
              <IconButton label="Delete comment" onClick={() => void deleteComment(comment.id)} danger>
                <Trash2 size={15} />
              </IconButton>
            </div>
          ))}
          {!commentsLoading && comments.length === 0 ? <span className="muted-row">No comments yet.</span> : null}
          <form className="comment-form" onSubmit={addComment}>
            <textarea
              maxLength={1000}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add a note"
              value={commentBody}
            />
            <button className="secondary-button" disabled={!commentBody.trim() || commentSaving} type="submit">
              <MessageSquare size={16} />
              Add
            </button>
          </form>
        </div>
      ) : null}
      {canEdit ? (
        <>
          <form className="sticker-edit-form" onSubmit={saveMetadata}>
            <label>
              Emojis
              <input value={emojis} onChange={(event) => setEmojis(event.target.value)} placeholder="smile,laugh" />
            </label>
            <label>
              Alt text
              <input value={accessibilityText} onChange={(event) => setAccessibilityText(event.target.value)} maxLength={125} />
            </label>
            <label>
              Review
              <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value as Sticker['reviewStatus'])}>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="NEEDS_WORK">Needs work</option>
              </select>
            </label>
            <button className="secondary-button sticker-save" disabled={!dirty || saving} type="submit">
              Save
            </button>
          </form>
          <form className="sticker-replace-form" onSubmit={replaceImage}>
            <label className="file-drop sticker-replace-drop">
              <input accept="image/*" onChange={(event) => setReplacementFile(event.target.files?.[0] ?? null)} type="file" />
              <ImagePlus size={18} />
              <span>{replacementFile ? replacementFile.name : 'Replace image'}</span>
            </label>
            <button className="secondary-button sticker-save" disabled={!replacementFile || replacing} type="submit">
              {replacing ? 'Replacing' : 'Replace'}
            </button>
          </form>
          {replacementFile ? (
            <ImageEditControls file={replacementFile} options={replacementEditOptions} onChange={setReplacementEditOptions} compact />
          ) : null}
          {renderTransferControls()}
          <IconButton label="Delete sticker" onClick={() => void deleteSticker()} danger>
            <Trash2 size={16} />
          </IconButton>
        </>
      ) : null}
      {detailOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel sticker-detail-dialog">
            <div className="section-heading">
              <h2>Sticker detail</h2>
              <button className="secondary-button" onClick={() => setDetailOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="sticker-detail-layout">
              <div className="sticker-detail-preview">
                {url ? <img alt={sticker.accessibilityText ?? sticker.fileName} src={url} /> : null}
              </div>
              <div className="sticker-detail-meta">
                <Metric label="Size" value={formatBytes(sticker.sizeBytes)} />
                <Metric label="Position" value={String(sticker.position + 1)} />
                <Metric label="Status" value={reviewStatusLabel(sticker.reviewStatus)} />
                <Metric label="Created" value={new Date(sticker.createdAt).toLocaleDateString()} />
              </div>
              {canEdit ? (
                <form className="form-grid" onSubmit={saveMetadata}>
                  <label>
                    Emojis
                    <input value={emojis} onChange={(event) => setEmojis(event.target.value)} placeholder="smile,laugh" />
                  </label>
                  <label>
                    Alt text
                    <input
                      value={accessibilityText}
                      onChange={(event) => setAccessibilityText(event.target.value)}
                      maxLength={125}
                    />
                  </label>
                  <label>
                    Review
                    <select
                      value={reviewStatus}
                      onChange={(event) => setReviewStatus(event.target.value as Sticker['reviewStatus'])}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="APPROVED">Approved</option>
                      <option value="NEEDS_WORK">Needs work</option>
                    </select>
                  </label>
                  <button className="primary-button" disabled={!dirty || saving} type="submit">
                    <Edit3 size={17} />
                    Save metadata
                  </button>
                </form>
              ) : null}
              {renderTransferControls()}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

type ImageEditOptions = {
  rotation: 0 | 90 | 180 | 270;
  cropSquare: boolean;
  normalizeSquare: boolean;
  removeLightBackground: boolean;
  serverBackgroundRemovalMode: 'none' | 'threshold' | 'ai';
  backgroundThreshold: number;
  backgroundFeather: number;
  cleanupSpeckles: boolean;
  speckleSize: number;
  outline: boolean;
  shadow: boolean;
  zoom: number;
  offsetX: number;
  offsetY: number;
  brushMode: BrushMode;
  brushSize: number;
  brushStrokes: BrushStroke[];
  textEnabled: boolean;
  textContent: string;
  textSize: number;
  textColor: string;
  textStrokeColor: string;
  textStrokeWidth: number;
  textRotation: number;
  textX: number;
  textY: number;
  autoFitSubject: boolean;
  subjectPadding: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpen: number;
  warmth: number;
  tint: number;
  grayscale: boolean;
  optimizeOutput: boolean;
  outputQuality: number;
  animatedTrimStart: number;
  animatedTrimEnd: number;
  animatedFrameRate: number;
  animatedCompress: boolean;
};

type BrushMode = 'erase' | 'restore';

type BrushPoint = {
  x: number;
  y: number;
};

type BrushStroke = {
  id: string;
  mode: BrushMode;
  size: number;
  points: BrushPoint[];
};

const defaultImageEditOptions: ImageEditOptions = {
  rotation: 0,
  cropSquare: false,
  normalizeSquare: false,
  removeLightBackground: false,
  serverBackgroundRemovalMode: 'none',
  backgroundThreshold: 238,
  backgroundFeather: 14,
  cleanupSpeckles: true,
  speckleSize: 24,
  outline: false,
  shadow: false,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  brushMode: 'erase',
  brushSize: 28,
  brushStrokes: [],
  textEnabled: false,
  textContent: '',
  textSize: 64,
  textColor: '#ffffff',
  textStrokeColor: '#111827',
  textStrokeWidth: 6,
  textRotation: 0,
  textX: 50,
  textY: 82,
  autoFitSubject: false,
  subjectPadding: 12,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpen: 0,
  warmth: 0,
  tint: 0,
  grayscale: false,
  optimizeOutput: false,
  outputQuality: 82,
  animatedTrimStart: 0,
  animatedTrimEnd: 10,
  animatedFrameRate: 15,
  animatedCompress: true,
};

function cloneImageEditOptions(options: ImageEditOptions): ImageEditOptions {
  return {
    ...options,
    brushStrokes: options.brushStrokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  };
}

function imageEditBadges(options: ImageEditOptions, file: File, isAnimatedPack: boolean) {
  const badges: string[] = [];
  if (options.rotation !== 0 || options.cropSquare || options.normalizeSquare || options.zoom !== 1 || options.offsetX !== 0 || options.offsetY !== 0) {
    badges.push('Framing');
  }
  if (options.removeLightBackground || options.serverBackgroundRemovalMode !== 'none') {
    badges.push(options.serverBackgroundRemovalMode === 'ai' ? 'AI bg' : 'Background');
  }
  if (options.brushStrokes.length > 0) {
    badges.push(`${options.brushStrokes.length} brush stroke${options.brushStrokes.length === 1 ? '' : 's'}`);
  }
  if (options.outline || options.shadow || options.textEnabled) {
    badges.push('Sticker effects');
  }
  if (hasColorAdjustments(options) || options.grayscale) {
    badges.push('Color');
  }
  if (options.optimizeOutput) {
    badges.push('Optimized');
  }
  if (isAnimatedPack && isAnimatedSourceFile(file) && (options.animatedTrimStart > 0 || options.animatedTrimEnd < 10 || options.animatedFrameRate !== 15)) {
    badges.push('Animation');
  }
  return badges.length > 0 ? badges : ['Original image'];
}

const imageEditPresets: Array<{ name: string; options: Partial<ImageEditOptions> }> = [
  {
    name: 'Meme cutout',
    options: {
      removeLightBackground: true,
      backgroundThreshold: 232,
      backgroundFeather: 18,
      cleanupSpeckles: true,
      speckleSize: 36,
      autoFitSubject: true,
      normalizeSquare: true,
      outline: true,
      textEnabled: true,
      textContent: 'TEXT',
      textY: 84,
    },
  },
  {
    name: 'Soft shadow',
    options: {
      normalizeSquare: true,
      autoFitSubject: true,
      subjectPadding: 14,
      shadow: true,
    },
  },
  {
    name: 'Bold outline',
    options: {
      removeLightBackground: true,
      backgroundThreshold: 236,
      backgroundFeather: 10,
      outline: true,
      autoFitSubject: true,
      normalizeSquare: true,
    },
  },
];

function ImageEditControls({
  backgroundRemovalStatus,
  file,
  options,
  onChange,
  compact = false,
  modal = false,
}: {
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
  file: File;
  options: ImageEditOptions;
  onChange: Dispatch<SetStateAction<ImageEditOptions>>;
  compact?: boolean;
  modal?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewBoundsRef = useRef({ x: 0, y: 0, width: 1, height: 1 });
  const activeStrokeIdRef = useRef<string | null>(null);
  const [redoStrokes, setRedoStrokes] = useState<BrushStroke[]>([]);
  const [outputSize, setOutputSize] = useState<number | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const isPossiblyAnimated = /\.(gif|webp)$/i.test(file.name);
  const showBackgroundControls = options.removeLightBackground || options.serverBackgroundRemovalMode !== 'none';
  const animatedDuration = Math.max(0, options.animatedTrimEnd - options.animatedTrimStart);
  const animatedFrameDuration = 1000 / Math.max(1, options.animatedFrameRate);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSourcePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    setOutputSize(null);
    drawCheckerboard(context, canvas.width, canvas.height, 16);
    editImageFile(file, options)
      .then((editedFile) => {
        setOutputSize(editedFile.size);
        objectUrl = URL.createObjectURL(editedFile);
        return loadImageFromUrl(objectUrl);
      })
      .then((image) => {
        if (!alive || !image) return;
        drawCheckerboard(context, canvas.width, canvas.height, 16);
        const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const x = (canvas.width - width) / 2;
        const y = (canvas.height - height) / 2;
        previewBoundsRef.current = {
          x: x / canvas.width,
          y: y / canvas.height,
          width: width / canvas.width,
          height: height / canvas.height,
        };
        context.drawImage(image, x, y, width, height);
      })
      .catch(() => drawCheckerboard(context, canvas.width, canvas.height, 16));

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, options]);

  useEffect(() => {
    setRedoStrokes([]);
  }, [file]);

  function rotate(delta: 90 | -90) {
    const nextRotation = (((options.rotation + delta + 360) % 360) as ImageEditOptions['rotation']);
    onChange({ ...options, rotation: nextRotation });
  }

  function setBrushMode(mode: BrushMode) {
    onChange((current) => ({ ...current, brushMode: mode }));
  }

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): BrushPoint | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) / rect.width;
    const canvasY = (event.clientY - rect.top) / rect.height;
    const bounds = previewBoundsRef.current;
    const x = (canvasX - bounds.x) / bounds.width;
    const y = (canvasY - bounds.y) / bounds.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function startBrushStroke(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event);
    if (!point) return;
    const stroke: BrushStroke = {
      id: crypto.randomUUID(),
      mode: options.brushMode,
      size: options.brushSize,
      points: [point],
    };
    activeStrokeIdRef.current = stroke.id;
    event.currentTarget.setPointerCapture(event.pointerId);
    setRedoStrokes([]);
    onChange((current) => ({ ...current, brushStrokes: [...current.brushStrokes, stroke] }));
  }

  function continueBrushStroke(event: PointerEvent<HTMLCanvasElement>) {
    const activeStrokeId = activeStrokeIdRef.current;
    if (!activeStrokeId) return;
    const point = pointFromEvent(event);
    if (!point) return;
    onChange((current) => ({
      ...current,
      brushStrokes: current.brushStrokes.map((stroke) => {
        if (stroke.id !== activeStrokeId) return stroke;
        const previous = stroke.points.at(-1);
        if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.004) return stroke;
        return { ...stroke, points: [...stroke.points, point] };
      }),
    }));
  }

  function finishBrushStroke() {
    activeStrokeIdRef.current = null;
  }

  function undoBrushStroke() {
    const previousStroke = options.brushStrokes.at(-1);
    if (!previousStroke) return;
    setRedoStrokes((strokes) => [...strokes, previousStroke]);
    onChange((current) => ({ ...current, brushStrokes: current.brushStrokes.slice(0, -1) }));
  }

  function redoBrushStroke() {
    const stroke = redoStrokes.at(-1);
    if (!stroke) return;
    setRedoStrokes((strokes) => strokes.slice(0, -1));
    onChange((current) => ({ ...current, brushStrokes: [...current.brushStrokes, stroke] }));
  }

  function applyPreset(preset: Partial<ImageEditOptions>) {
    setRedoStrokes([]);
    onChange((current) => ({ ...current, ...preset, brushStrokes: [], brushMode: current.brushMode, brushSize: current.brushSize }));
  }

  return (
    <div className={`image-edit-controls ${compact ? 'compact' : ''} ${modal ? 'modal-editor' : ''} ${compareMode ? 'compare-mode' : ''}`}>
      <div className={`image-edit-preview ${compareMode ? 'compare' : ''}`}>
        {compareMode && sourcePreviewUrl ? (
          <div className="compare-pane">
            <span>Before</span>
            <img alt="Original preview" src={sourcePreviewUrl} />
          </div>
        ) : null}
        <div className="compare-pane">
          {compareMode ? <span>After</span> : null}
          <canvas
            aria-label="Edited preview canvas"
            onPointerCancel={finishBrushStroke}
            onPointerDown={startBrushStroke}
            onPointerLeave={finishBrushStroke}
            onPointerMove={continueBrushStroke}
            onPointerUp={finishBrushStroke}
            ref={canvasRef}
          />
        </div>
      </div>
      <div className="image-edit-actions">
        <IconButton label="Rotate left" onClick={() => rotate(-90)}>
          <RotateCcw size={16} />
        </IconButton>
        <IconButton label="Rotate right" onClick={() => rotate(90)}>
          <RotateCw size={16} />
        </IconButton>
        <IconButton label="Undo brush" disabled={options.brushStrokes.length === 0} onClick={undoBrushStroke}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo brush" disabled={redoStrokes.length === 0} onClick={redoBrushStroke}>
          <Redo2 size={16} />
        </IconButton>
        <IconButton label="Erase brush" onClick={() => setBrushMode('erase')}>
          <Eraser size={16} />
        </IconButton>
        <IconButton label="Restore brush" onClick={() => setBrushMode('restore')}>
          <RefreshCw size={16} />
        </IconButton>
        <IconButton label="Compare before after" onClick={() => setCompareMode((enabled) => !enabled)}>
          <Eye size={16} />
        </IconButton>
        <IconButton
          label="Center subject"
          onClick={() => onChange((current) => ({ ...current, autoFitSubject: true, normalizeSquare: true }))}
        >
          <MoveRight size={16} />
        </IconButton>
        <label className="checkbox-row image-edit-toggle">
          <input
            checked={options.cropSquare}
            onChange={(event) =>
              onChange({
                ...options,
                cropSquare: event.target.checked,
                zoom: event.target.checked ? options.zoom : 1,
                offsetX: event.target.checked ? options.offsetX : 0,
                offsetY: event.target.checked ? options.offsetY : 0,
              })
            }
            type="checkbox"
          />
          Square crop
        </label>
        <label className="checkbox-row image-edit-toggle">
          <input
            checked={options.normalizeSquare}
            onChange={(event) => onChange({ ...options, normalizeSquare: event.target.checked })}
            type="checkbox"
          />
          Normalize square
        </label>
        <label className="checkbox-row image-edit-toggle">
          <input
            checked={options.removeLightBackground}
            onChange={(event) => onChange({ ...options, removeLightBackground: event.target.checked })}
            type="checkbox"
          />
          Remove light background
        </label>
        <label>
          Server bg
          <select
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                serverBackgroundRemovalMode: event.target.value as ImageEditOptions['serverBackgroundRemovalMode'],
              }))
            }
            value={options.serverBackgroundRemovalMode}
          >
            <option value="none">Off</option>
            <option value="threshold">Threshold</option>
            <option value="ai">AI/fallback</option>
          </select>
        </label>
        <label className="checkbox-row image-edit-toggle">
          <input checked={options.outline} onChange={(event) => onChange({ ...options, outline: event.target.checked })} type="checkbox" />
          Outline
        </label>
        <label className="checkbox-row image-edit-toggle">
          <input checked={options.shadow} onChange={(event) => onChange({ ...options, shadow: event.target.checked })} type="checkbox" />
          Shadow
        </label>
        <label className="checkbox-row image-edit-toggle">
          <input
            checked={options.textEnabled}
            onChange={(event) => onChange((current) => ({ ...current, textEnabled: event.target.checked }))}
            type="checkbox"
          />
          Text
        </label>
        <label className="checkbox-row image-edit-toggle">
          <input
            checked={options.autoFitSubject}
            onChange={(event) => onChange((current) => ({ ...current, autoFitSubject: event.target.checked, normalizeSquare: event.target.checked || current.normalizeSquare }))}
            type="checkbox"
          />
          Auto-fit
        </label>
        <label className="checkbox-row image-edit-toggle">
          <input
            checked={options.grayscale}
            onChange={(event) => onChange((current) => ({ ...current, grayscale: event.target.checked }))}
            type="checkbox"
          />
          Grayscale
        </label>
      </div>
      <div className="preset-row" aria-label="Image edit presets">
        {imageEditPresets.map((preset) => (
          <button className="secondary-button" key={preset.name} onClick={() => applyPreset(preset.options)} type="button">
            {preset.name}
          </button>
        ))}
      </div>
      <div className="layer-strip" aria-label="Canvas layers">
        <span>Transparent bg</span>
        <span>Sticker</span>
        <span className={options.outline || options.shadow ? 'active' : ''}>Effects</span>
        <span className={options.textEnabled ? 'active' : ''}>Text</span>
      </div>
      <div className="image-edit-sliders brush-sliders">
        <label>
          Brush size
          <input
            max="120"
            min="4"
            onChange={(event) => onChange((current) => ({ ...current, brushSize: Number(event.target.value) }))}
            step="1"
            type="range"
          value={options.brushSize}
          />
        </label>
        <span className="brush-status">{options.brushMode === 'erase' ? 'Erasing pixels' : 'Restoring pixels'}</span>
      </div>
      {options.textEnabled ? (
        <div className="image-edit-sliders text-sliders">
          <label>
            Text
            <input
              maxLength={40}
              onChange={(event) => onChange((current) => ({ ...current, textContent: event.target.value }))}
              placeholder="meme text"
              value={options.textContent}
            />
          </label>
          <label>
            Size
            <input
              max="140"
              min="18"
              onChange={(event) => onChange((current) => ({ ...current, textSize: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.textSize}
            />
          </label>
          <label>
            Fill
            <input
              onChange={(event) => onChange((current) => ({ ...current, textColor: event.target.value }))}
              type="color"
              value={options.textColor}
            />
          </label>
          <label>
            Stroke
            <input
              onChange={(event) => onChange((current) => ({ ...current, textStrokeColor: event.target.value }))}
              type="color"
              value={options.textStrokeColor}
            />
          </label>
          <label>
            Stroke width
            <input
              max="20"
              min="0"
              onChange={(event) => onChange((current) => ({ ...current, textStrokeWidth: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.textStrokeWidth}
            />
          </label>
          <label>
            Rotate
            <input
              max="45"
              min="-45"
              onChange={(event) => onChange((current) => ({ ...current, textRotation: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.textRotation}
            />
          </label>
          <label>
            X
            <input
              max="100"
              min="0"
              onChange={(event) => onChange((current) => ({ ...current, textX: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.textX}
            />
          </label>
          <label>
            Y
            <input
              max="100"
              min="0"
              onChange={(event) => onChange((current) => ({ ...current, textY: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.textY}
            />
          </label>
        </div>
      ) : null}
      <div className="image-edit-sliders color-sliders">
        <label>
          Brightness
          <input
            max="100"
            min="-100"
            onChange={(event) => onChange((current) => ({ ...current, brightness: Number(event.target.value) }))}
            step="1"
            type="range"
            value={options.brightness}
          />
        </label>
        <label>
          Contrast
          <input
            max="100"
            min="-100"
            onChange={(event) => onChange((current) => ({ ...current, contrast: Number(event.target.value) }))}
            step="1"
            type="range"
            value={options.contrast}
          />
        </label>
        <label>
          Saturation
          <input
            max="100"
            min="-100"
            onChange={(event) => onChange((current) => ({ ...current, saturation: Number(event.target.value) }))}
            step="1"
            type="range"
            value={options.saturation}
          />
        </label>
        <label>
          Sharpen
          <input
            max="100"
            min="0"
            onChange={(event) => onChange((current) => ({ ...current, sharpen: Number(event.target.value) }))}
            step="1"
            type="range"
            value={options.sharpen}
          />
        </label>
        <label>
          Warmth
          <input
            max="100"
            min="-100"
            onChange={(event) => onChange((current) => ({ ...current, warmth: Number(event.target.value) }))}
            step="1"
            type="range"
            value={options.warmth}
          />
        </label>
        <label>
          Tint
          <input
            max="100"
            min="-100"
            onChange={(event) => onChange((current) => ({ ...current, tint: Number(event.target.value) }))}
            step="1"
            type="range"
            value={options.tint}
          />
        </label>
      </div>
      <div className="optimizer-panel">
        <label className="checkbox-row image-edit-toggle">
          <input
            checked={options.optimizeOutput}
            onChange={(event) => onChange((current) => ({ ...current, optimizeOutput: event.target.checked }))}
            type="checkbox"
          />
          Optimize under 100KB
        </label>
        <label>
          Quality
          <input
            disabled={!options.optimizeOutput}
            max="95"
            min="35"
            onChange={(event) => onChange((current) => ({ ...current, outputQuality: Number(event.target.value) }))}
            step="1"
            type="range"
            value={options.outputQuality}
          />
        </label>
        <span className={outputSize && outputSize > 100 * 1024 ? 'optimizer-warning' : 'optimizer-ok'}>
          {outputSize ? `Output ${formatBytes(outputSize)}` : 'Output pending'}
        </span>
        {outputSize && !isPossiblyAnimated && outputSize > 100 * 1024 ? (
          <span className="optimizer-warning">Static WhatsApp stickers should be under 100KB.</span>
        ) : null}
        {isPossiblyAnimated && file.size > 500 * 1024 ? (
          <span className="optimizer-warning">Animated WhatsApp stickers should be under 500KB.</span>
        ) : null}
      </div>
      {isPossiblyAnimated ? (
        <div className="animated-panel">
          {sourcePreviewUrl ? <img alt="Animated source preview" src={sourcePreviewUrl} /> : null}
          <label>
            Trim start
            <input
              max="10"
              min="0"
              onChange={(event) => onChange((current) => ({ ...current, animatedTrimStart: Number(event.target.value) }))}
              step="0.1"
              type="range"
              value={options.animatedTrimStart}
            />
          </label>
          <label>
            Trim end
            <input
              max="10"
              min="0.1"
              onChange={(event) => onChange((current) => ({ ...current, animatedTrimEnd: Number(event.target.value) }))}
              step="0.1"
              type="range"
              value={options.animatedTrimEnd}
            />
          </label>
          <label>
            Frame rate
            <input
              max="30"
              min="1"
              onChange={(event) => onChange((current) => ({ ...current, animatedFrameRate: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.animatedFrameRate}
            />
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.animatedCompress}
              onChange={(event) => onChange((current) => ({ ...current, animatedCompress: event.target.checked }))}
              type="checkbox"
            />
            Server compress
          </label>
          <span className={animatedDuration > 10 || animatedDuration <= 0 ? 'optimizer-warning' : 'optimizer-ok'}>
            Duration {animatedDuration.toFixed(1)}s / 10s max
          </span>
          <span className={animatedFrameDuration < 8 ? 'optimizer-warning' : 'optimizer-ok'}>
            Frame {Math.round(animatedFrameDuration)}ms
          </span>
        </div>
      ) : null}
      {options.autoFitSubject ? (
        <div className="image-edit-sliders subject-sliders">
          <label>
            Subject padding
            <input
              max="35"
              min="0"
              onChange={(event) => onChange((current) => ({ ...current, subjectPadding: Number(event.target.value) }))}
              step="1"
              type="range"
              value={options.subjectPadding}
            />
          </label>
        </div>
      ) : null}
      {options.serverBackgroundRemovalMode !== 'none' ? (
        <p className="upload-note server-bg-note">
          {serverBackgroundRemovalMessage(options.serverBackgroundRemovalMode, backgroundRemovalStatus)}
        </p>
      ) : null}
      {showBackgroundControls ? (
        <div className="image-edit-sliders background-sliders">
          <label>
            Threshold
            <input
              max="255"
              min="180"
              onChange={(event) => onChange({ ...options, backgroundThreshold: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.backgroundThreshold}
            />
          </label>
          <label>
            Soft edge
            <input
              max="48"
              min="0"
              onChange={(event) => onChange({ ...options, backgroundFeather: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.backgroundFeather}
            />
          </label>
          <label className="checkbox-row image-edit-toggle">
            <input
              checked={options.cleanupSpeckles}
              onChange={(event) => onChange({ ...options, cleanupSpeckles: event.target.checked })}
              type="checkbox"
            />
            Cleanup speckles
          </label>
          {options.cleanupSpeckles ? (
            <label>
              Speckle size
              <input
                max="180"
                min="4"
                onChange={(event) => onChange({ ...options, speckleSize: Number(event.target.value) })}
                step="1"
                type="range"
                value={options.speckleSize}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      {options.cropSquare ? (
        <div className="image-edit-sliders">
          <label>
            Zoom
            <input
              max="3"
              min="1"
              onChange={(event) => onChange({ ...options, zoom: Number(event.target.value) })}
              step="0.05"
              type="range"
              value={options.zoom}
            />
          </label>
          <label>
            Horizontal
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange({ ...options, offsetX: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.offsetX}
            />
          </label>
          <label>
            Vertical
            <input
              max="100"
              min="-100"
              onChange={(event) => onChange({ ...options, offsetY: Number(event.target.value) })}
              step="1"
              type="range"
              value={options.offsetY}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NoticeBar({ notice, onClose }: { notice: Notice; onClose?: () => void }) {
  return (
    <div className={`notice ${notice.tone}`} role="status">
      <span>{notice.text}</span>
      {onClose ? (
        <button onClick={onClose} type="button">
          Close
        </button>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${danger ? 'danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
      aria-label={label}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <section className="empty-state">
      <ImagePlus size={34} />
      <h2>No pack selected</h2>
      <p>Create or select a pack.</p>
    </section>
  );
}

function exportFileName(pack: Pack) {
  const slug = pack.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'sticker-pack';
  return `${slug}-${pack.id.slice(0, 8)}.zip`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sharePackIdFromPath() {
  const match = window.location.pathname.match(/^\/share\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function roleLabel(role?: PackRole) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'VIEWER') return 'Viewer';
  return 'Private';
}

function reviewStatusLabel(status: Sticker['reviewStatus']) {
  if (status === 'APPROVED') return 'Approved';
  if (status === 'NEEDS_WORK') return 'Needs work';
  return 'Pending';
}

function reviewStatusClass(status: Sticker['reviewStatus']) {
  if (status === 'APPROVED') return 'ready';
  if (status === 'NEEDS_WORK') return 'needs-work';
  return 'pending';
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

function auditActionLabel(action: string) {
  return action
    .split('.')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function isExpiredInvite(invite: PackInvite) {
  return Boolean(!invite.acceptedAt && invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now());
}

function inviteStatusLabel(invite: PackInvite) {
  if (invite.acceptedAt) return `Accepted by ${invite.acceptedBy?.email ?? 'member'}`;
  if (isExpiredInvite(invite)) return `Expired ${new Date(invite.expiresAt as string).toLocaleDateString()}`;
  if (invite.expiresAt) return `${roleLabel(invite.role)} · expires ${new Date(invite.expiresAt).toLocaleDateString()}`;
  return roleLabel(invite.role);
}

function isAnimatedSourceFile(file: File) {
  return file.type === 'image/gif' || file.type === 'image/webp' || /\.(gif|webp)$/i.test(file.name);
}

function animatedOptionsFromEdit(file: File, isAnimatedPack: boolean, options: ImageEditOptions): AnimatedStickerOptions | undefined {
  if (!isAnimatedPack || !isAnimatedSourceFile(file)) return undefined;
  return {
    animatedTrimStart: options.animatedTrimStart,
    animatedTrimEnd: options.animatedTrimEnd,
    animatedFrameRate: options.animatedFrameRate,
    animatedQuality: options.animatedCompress ? options.outputQuality : undefined,
  };
}

function backgroundRemovalOptionsFromEdit(isAnimatedPack: boolean, options: ImageEditOptions): BackgroundRemovalUploadOptions | undefined {
  if (isAnimatedPack || options.serverBackgroundRemovalMode === 'none') return undefined;
  return {
    backgroundRemovalMode: options.serverBackgroundRemovalMode,
    backgroundRemovalThreshold: options.backgroundThreshold,
    backgroundRemovalFeather: options.backgroundFeather,
    backgroundRemovalCleanupSpeckles: options.cleanupSpeckles,
    backgroundRemovalSpeckleSize: options.speckleSize,
  };
}

function serverBackgroundRemovalMessage(
  mode: ImageEditOptions['serverBackgroundRemovalMode'],
  status?: AdminSettings['backgroundRemoval'],
) {
  if (mode === 'threshold') return 'Server threshold cleanup uses the same threshold, soft edge, and speckle controls.';
  if (!status) return 'Server AI availability is visible to admins; uploads fall back to threshold if no model is configured.';
  if (status.aiCommandConfigured) return 'Server AI command is configured; failed AI runs fall back to threshold cleanup.';
  return 'Server AI is not configured yet; this upload will use threshold fallback.';
}

function stickerUploadOptionsFromEdit(file: File, isAnimatedPack: boolean, options: ImageEditOptions): StickerUploadOptions | undefined {
  return {
    ...animatedOptionsFromEdit(file, isAnimatedPack, options),
    ...backgroundRemovalOptionsFromEdit(isAnimatedPack, options),
  };
}

async function editableUploadFile(file: File, isAnimatedPack: boolean, options: ImageEditOptions) {
  return isAnimatedPack && isAnimatedSourceFile(file) ? file : editImageFile(file, options);
}

async function editImageFile(file: File, options: ImageEditOptions) {
  if (
    options.rotation === 0 &&
    !options.cropSquare &&
    !options.normalizeSquare &&
    !options.removeLightBackground &&
    !options.outline &&
    !options.shadow &&
    !options.autoFitSubject &&
    !hasColorAdjustments(options) &&
    !options.optimizeOutput &&
    options.brushStrokes.length === 0 &&
    (!options.textEnabled || options.textContent.trim().length === 0)
  ) {
    return file;
  }

  const image = await loadImage(file);
  const sourceSize = options.cropSquare ? Math.min(image.naturalWidth, image.naturalHeight) / Math.max(options.zoom, 1) : undefined;
  const sourceWidth = sourceSize ?? image.naturalWidth;
  const sourceHeight = sourceSize ?? image.naturalHeight;
  const sourceX = sourceSize
    ? clamp(
        (image.naturalWidth - sourceWidth) / 2 + ((image.naturalWidth - sourceWidth) / 2) * (options.offsetX / 100),
        0,
        image.naturalWidth - sourceWidth,
      )
    : 0;
  const sourceY = sourceSize
    ? clamp(
        (image.naturalHeight - sourceHeight) / 2 + ((image.naturalHeight - sourceHeight) / 2) * (options.offsetY / 100),
        0,
        image.naturalHeight - sourceHeight,
      )
    : 0;
  const rotated = options.rotation === 90 || options.rotation === 270;

  const canvas = document.createElement('canvas');
  const outputWidth = rotated ? sourceHeight : sourceWidth;
  const outputHeight = rotated ? sourceWidth : sourceHeight;
  const normalizedSide = options.normalizeSquare ? Math.max(outputWidth, outputHeight) : undefined;
  canvas.width = normalizedSide ?? outputWidth;
  canvas.height = normalizedSide ?? outputHeight;

  const context = canvas.getContext('2d');
  if (!context) return file;

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((options.rotation * Math.PI) / 180);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  context.setTransform(1, 0, 0, 1, 0, 0);

  if (hasColorAdjustments(options)) {
    applyColorAdjustments(context, canvas.width, canvas.height, options);
  }

  const restoreSource = document.createElement('canvas');
  restoreSource.width = canvas.width;
  restoreSource.height = canvas.height;
  restoreSource.getContext('2d')?.drawImage(canvas, 0, 0);

  if (options.removeLightBackground) {
    removeLightBackground(context, canvas.width, canvas.height, options);
  }
  if (options.brushStrokes.length > 0) {
    applyBrushStrokes(context, canvas.width, canvas.height, options.brushStrokes, restoreSource);
  }
  if (options.autoFitSubject) {
    fitSubjectToCanvas(context, options.subjectPadding);
  }
  if (options.outline) {
    applyOutline(context, canvas.width, canvas.height);
  }
  if (options.shadow) {
    applyShadow(context, canvas.width, canvas.height);
  }
  if (options.textEnabled && options.textContent.trim()) {
    applyTextLayer(context, canvas.width, canvas.height, options);
  }

  const blob = options.optimizeOutput ? await optimizeCanvasBlob(canvas, options.outputQuality) : await canvasToBlob(canvas, 'image/png');
  if (!blob) return file;

  return new File([blob], editedFileName(file, blob.type), { type: blob.type });
}

function removeLightBackground(context: CanvasRenderingContext2D, width: number, height: number, options: ImageEditOptions) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const threshold = clamp(options.backgroundThreshold, 180, 255);
  const feather = clamp(options.backgroundFeather, 0, 48);
  const tolerance = 28;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (colorSpread > tolerance) continue;

    if (brightness >= threshold) {
      data[index + 3] = 0;
      continue;
    }

    if (feather > 0 && brightness >= threshold - feather) {
      const distance = (threshold - brightness) / feather;
      data[index + 3] = Math.round(data[index + 3] * clamp(distance, 0, 1));
    }
  }

  if (options.cleanupSpeckles) {
    removeSmallAlphaIslands(imageData, width, height, options.speckleSize);
  }

  context.putImageData(imageData, 0, 0);
}

function removeSmallAlphaIslands(imageData: ImageData, width: number, height: number, maxArea: number) {
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const component: number[] = [];
  const areaLimit = clamp(Math.round(maxArea), 4, 180);

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || data[start * 4 + 3] <= 12) continue;

    stack.length = 0;
    component.length = 0;
    stack.push(start);
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop() as number;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [current - 1, current + 1, current - width, current + width];

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
        const neighborX = neighbor % width;
        const neighborY = Math.floor(neighbor / width);
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) continue;
        if (data[neighbor * 4 + 3] <= 12) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    if (component.length <= areaLimit) {
      for (const pixel of component) {
        data[pixel * 4 + 3] = 0;
      }
    }
  }
}

function hasColorAdjustments(options: ImageEditOptions) {
  return (
    options.brightness !== 0 ||
    options.contrast !== 0 ||
    options.saturation !== 0 ||
    options.sharpen !== 0 ||
    options.warmth !== 0 ||
    options.tint !== 0 ||
    options.grayscale
  );
}

function applyColorAdjustments(context: CanvasRenderingContext2D, width: number, height: number, options: ImageEditOptions) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const brightness = clamp(options.brightness, -100, 100) * 2.55;
  const contrast = clamp(options.contrast, -100, 100);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const saturationFactor = 1 + clamp(options.saturation, -100, 100) / 100;
  const warmth = clamp(options.warmth, -100, 100) * 0.9;
  const tint = clamp(options.tint, -100, 100) * 0.7;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    let red = data[index] + brightness + warmth + tint * 0.45;
    let green = data[index + 1] + brightness - tint * 0.6;
    let blue = data[index + 2] + brightness - warmth + tint * 0.45;

    red = contrastFactor * (red - 128) + 128;
    green = contrastFactor * (green - 128) + 128;
    blue = contrastFactor * (blue - 128) + 128;

    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    if (options.grayscale) {
      red = luminance;
      green = luminance;
      blue = luminance;
    } else {
      red = luminance + (red - luminance) * saturationFactor;
      green = luminance + (green - luminance) * saturationFactor;
      blue = luminance + (blue - luminance) * saturationFactor;
    }

    data[index] = clamp(Math.round(red), 0, 255);
    data[index + 1] = clamp(Math.round(green), 0, 255);
    data[index + 2] = clamp(Math.round(blue), 0, 255);
  }

  if (options.sharpen > 0) {
    sharpenImageData(imageData, width, height, clamp(options.sharpen, 0, 100) / 100);
  }

  context.putImageData(imageData, 0, 0);
}

function sharpenImageData(imageData: ImageData, width: number, height: number, amount: number) {
  const source = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel] * (1 + 4 * amount);
        const left = source[index - 4 + channel] * amount;
        const right = source[index + 4 + channel] * amount;
        const top = source[index - width * 4 + channel] * amount;
        const bottom = source[index + width * 4 + channel] * amount;
        data[index + channel] = clamp(Math.round(center - left - right - top - bottom), 0, 255);
      }
    }
  }
}

function applyBrushStrokes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: BrushStroke[],
  restoreSource: HTMLCanvasElement,
) {
  const restoreMask = document.createElement('canvas');
  restoreMask.width = width;
  restoreMask.height = height;
  const restoreMaskContext = restoreMask.getContext('2d');
  const restoreLayer = document.createElement('canvas');
  restoreLayer.width = width;
  restoreLayer.height = height;
  const restoreLayerContext = restoreLayer.getContext('2d');

  for (const stroke of strokes) {
    if (stroke.mode === 'erase') {
      context.save();
      context.globalCompositeOperation = 'destination-out';
      drawBrushStroke(context, stroke, width, height);
      context.restore();
      continue;
    }

    if (!restoreMaskContext || !restoreLayerContext) continue;
    restoreMaskContext.clearRect(0, 0, width, height);
    drawBrushStroke(restoreMaskContext, stroke, width, height);
    restoreLayerContext.clearRect(0, 0, width, height);
    restoreLayerContext.globalCompositeOperation = 'source-over';
    restoreLayerContext.drawImage(restoreSource, 0, 0);
    restoreLayerContext.globalCompositeOperation = 'destination-in';
    restoreLayerContext.drawImage(restoreMask, 0, 0);
    restoreLayerContext.globalCompositeOperation = 'source-over';
    context.drawImage(restoreLayer, 0, 0);
  }
}

function drawBrushStroke(context: CanvasRenderingContext2D, stroke: BrushStroke, width: number, height: number) {
  if (stroke.points.length === 0) return;
  const brushSize = Math.max(1, stroke.size * (Math.max(width, height) / 512));
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  context.strokeStyle = '#000';
  context.fillStyle = '#000';

  const [firstPoint, ...remainingPoints] = stroke.points;
  const firstX = firstPoint.x * width;
  const firstY = firstPoint.y * height;
  if (remainingPoints.length === 0) {
    context.beginPath();
    context.arc(firstX, firstY, brushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(firstX, firstY);
  for (const point of remainingPoints) {
    context.lineTo(point.x * width, point.y * height);
  }
  context.stroke();
  context.restore();
}

function applyTextLayer(context: CanvasRenderingContext2D, width: number, height: number, options: ImageEditOptions) {
  const text = options.textContent.trim();
  if (!text) return;
  const scale = Math.max(width, height) / 512;
  const fontSize = Math.max(8, options.textSize * scale);
  const strokeWidth = Math.max(0, options.textStrokeWidth * scale);
  const maxTextWidth = width * 0.92;
  const x = (options.textX / 100) * width;
  const y = (options.textY / 100) * height;

  context.save();
  context.translate(x, y);
  context.rotate((options.textRotation * Math.PI) / 180);
  context.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.miterLimit = 2;
  if (strokeWidth > 0) {
    context.lineWidth = strokeWidth;
    context.strokeStyle = options.textStrokeColor;
    context.strokeText(text, 0, 0, maxTextWidth);
  }
  context.fillStyle = options.textColor;
  context.fillText(text, 0, 0, maxTextWidth);
  context.restore();
}

function fitSubjectToCanvas(context: CanvasRenderingContext2D, paddingPercent: number) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = context.canvas.width;
  sourceCanvas.height = context.canvas.height;
  sourceCanvas.getContext('2d')?.drawImage(context.canvas, 0, 0);
  const bounds = visiblePixelBounds(context, sourceCanvas.width, sourceCanvas.height);
  if (!bounds) return;

  const padding = clamp(paddingPercent, 0, 35) / 100;
  const paddedWidth = bounds.width * (1 + padding * 2);
  const paddedHeight = bounds.height * (1 + padding * 2);
  const cropSize = Math.min(Math.max(paddedWidth, paddedHeight), Math.max(sourceCanvas.width, sourceCanvas.height));
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const sourceX = clamp(centerX - cropSize / 2, 0, Math.max(0, sourceCanvas.width - cropSize));
  const sourceY = clamp(centerY - cropSize / 2, 0, Math.max(0, sourceCanvas.height - cropSize));

  context.canvas.width = 512;
  context.canvas.height = 512;
  context.clearRect(0, 0, 512, 512);
  context.drawImage(sourceCanvas, sourceX, sourceY, cropSize, cropSize, 0, 0, 512, 512);
}

function visiblePixelBounds(context: CanvasRenderingContext2D, width: number, height: number) {
  const data = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function applyOutline(context: CanvasRenderingContext2D, width: number, height: number) {
  const original = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  output.data.set(original.data);
  const radius = 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (original.data[index + 3] > 0) continue;

      let nearOpaque = false;
      for (let offsetY = -radius; offsetY <= radius && !nearOpaque; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
          if (original.data[(sampleY * width + sampleX) * 4 + 3] > 64) {
            nearOpaque = true;
            break;
          }
        }
      }

      if (nearOpaque) {
        output.data[index] = 18;
        output.data[index + 1] = 22;
        output.data[index + 2] = 25;
        output.data[index + 3] = 220;
      }
    }
  }

  context.putImageData(output, 0, 0);
}

function applyShadow(context: CanvasRenderingContext2D, width: number, height: number) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source.getContext('2d')?.drawImage(context.canvas, 0, 0);

  context.clearRect(0, 0, width, height);
  context.save();
  context.shadowColor = 'rgba(15, 23, 42, 0.35)';
  context.shadowBlur = 12;
  context.shadowOffsetY = 8;
  context.drawImage(source, 0, 0);
  context.restore();
  context.drawImage(source, 0, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number, tileSize: number) {
  context.clearRect(0, 0, width, height);
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      context.fillStyle = (x / tileSize + y / tileSize) % 2 === 0 ? '#f7faf9' : '#d8e2df';
      context.fillRect(x, y, tileSize, tileSize);
    }
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image preview failed'));
    };
    image.src = url;
  });
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image preview failed'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function optimizeCanvasBlob(canvas: HTMLCanvasElement, initialQuality: number) {
  let quality = clamp(initialQuality, 35, 95) / 100;
  let bestBlob = await canvasToBlob(canvas, 'image/webp', quality);
  while (bestBlob && bestBlob.size > 100 * 1024 && quality > 0.35) {
    quality = Math.max(0.35, quality - 0.07);
    bestBlob = await canvasToBlob(canvas, 'image/webp', quality);
  }
  return bestBlob ?? canvasToBlob(canvas, 'image/png');
}

function editedFileName(file: File, mimeType = 'image/png') {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'sticker';
  const extension = mimeType === 'image/webp' ? 'webp' : 'png';
  return `${baseName}-edited.${extension}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function generatedAltText(pack: Pack, sticker: Sticker) {
  const emojiText = sticker.emojis.filter(Boolean).join(' ');
  const status = reviewStatusLabel(sticker.reviewStatus).toLowerCase();
  const parts = [`${pack.name} sticker`];
  if (emojiText) parts.push(`with ${emojiText}`);
  parts.push(`marked ${status}`);
  return parts.join(' ').slice(0, 125);
}

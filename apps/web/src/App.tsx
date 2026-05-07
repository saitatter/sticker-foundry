import {
  ArrowDown,
  ArrowUp,
  Archive,
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileJson,
  Globe2,
  GripVertical,
  ImagePlus,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminSettings,
  ApiError,
  AuditLogEntry,
  AuthResponse,
  InstanceSettings,
  Pack,
  PackInvite,
  PackMember,
  PackRole,
  RegistrationMode,
  Sticker,
  StickerFoundryApi,
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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);

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
    void refreshSelectedPack();
  }, [refreshSelectedPack]);

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
  };

  if (!token) {
    return <AuthScreen api={api} instanceSettings={instanceSettings} onSignedIn={saveSession} onError={reportError} notice={notice} />;
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
    if (quotaNumber !== null && (!Number.isFinite(quotaNumber) || quotaNumber <= 0)) {
      onError(new Error('Storage quota must be a positive number of MB'));
      return;
    }

    setSavingAdmin(true);
    try {
      const settings = await api.updateAdminSettings({
        registrationMode,
        registrationInviteCode: registrationInviteCode.trim() || null,
        storageQuotaBytes: quotaNumber === null ? null : Math.round(quotaNumber * 1024 * 1024),
        instanceName: instanceName.trim() || DEFAULT_INSTANCE_SETTINGS.instanceName,
        instanceDescription: instanceDescription.trim() || DEFAULT_INSTANCE_SETTINGS.instanceDescription,
      });
      setAdminSettings(settings);
      setRegistrationMode(settings.registrationMode);
      setRegistrationInviteCode(settings.registrationInviteCode ?? '');
      setStorageQuotaMb(settings.storageQuotaBytes ? String(Math.round(settings.storageQuotaBytes / 1024 / 1024)) : '');
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
  notice,
}: {
  api: StickerFoundryApi;
  instanceSettings: InstanceSettings;
  onSignedIn: (auth: AuthResponse) => void;
  onError: (error: unknown) => void;
  notice: Notice | null;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
  const [teamId, setTeamId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const pack = await api.createPack({ name, publisher, isPublic, teamId: teamId || undefined });
      setName('');
      setPublisher('');
      setIsPublic(false);
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
  pack,
  packs,
  onChanged,
  onDeleted,
  onCloned,
  onError,
  onNotice,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  packs: Pack[];
  onChanged: (message: string) => Promise<void>;
  onDeleted: () => void;
  onCloned: (pack: Pack) => void;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
}) {
  const stickers = pack.stickers ?? [];
  const canEdit = pack.canEdit ?? true;
  const canManage = pack.canManage ?? false;
  const canExport = stickers.length >= 3 && stickers.length <= 30;
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
  }, [pack.id]);

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

    try {
      await api.reorderStickers(pack.id, nextOrder);
      await onChanged('Sticker order updated');
    } catch (error) {
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

    try {
      await api.reorderStickers(pack.id, nextOrder);
      await onChanged('Sticker order updated');
    } catch (error) {
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

  function selectAllStickers() {
    setSelectedStickerIds(stickers.map((sticker) => sticker.id));
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
        <Metric label="Role" value={roleLabel(pack.role)} />
        <Metric label="Version" value={pack.imageDataVersion} />
        <Metric label="Updated" value={new Date(pack.updatedAt).toLocaleDateString()} />
      </div>

      <ExportReadiness stickerCount={stickers.length} canExport={canExport} />

      {contentsPreview ? <pre className="contents-preview">{contentsPreview}</pre> : null}

      {canManage ? <CollaborationPanel api={api} pack={pack} onChanged={onChanged} onError={onError} onNotice={onNotice} /> : null}

      {canManage ? <PackEditForm api={api} pack={pack} onChanged={onChanged} onError={onError} /> : null}

      {canEdit ? <TrayIconPanel api={api} pack={pack} onChanged={onChanged} onError={onError} /> : null}

      {canEdit ? (
        <UploadPanel
          api={api}
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
                key={sticker.id}
                packId={pack.id}
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

function ExportReadiness({ stickerCount, canExport }: { stickerCount: number; canExport: boolean }) {
  const missing = Math.max(0, 3 - stickerCount);

  return (
    <section className={`export-panel ${canExport ? 'ready' : 'blocked'}`}>
      <div className="export-status">
        {canExport ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        <div>
          <h3>{canExport ? 'WhatsApp export ready' : 'WhatsApp export blocked'}</h3>
          <p>
            {canExport
              ? 'ZIP includes contents.json, tray icon, and ordered stickers.'
              : `${missing} more sticker${missing === 1 ? '' : 's'} needed.`}
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(pack.name);
    setPublisher(pack.publisher);
    setDescription(pack.description ?? '');
    setIsPublic(pack.isPublic);
  }, [pack.description, pack.isPublic, pack.name, pack.publisher]);

  const dirty =
    name !== pack.name ||
    publisher !== pack.publisher ||
    description !== (pack.description ?? '') ||
    isPublic !== pack.isPublic;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updatePack(pack.id, {
        name,
        publisher,
        description,
        isPublic,
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
}: {
  api: StickerFoundryApi;
  pack: Pack;
  remainingSlots: number;
  onChanged: (message: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [editOptions, setEditOptions] = useState<ImageEditOptions>(defaultImageEditOptions);
  const [emojis, setEmojis] = useState('');
  const [accessibilityText, setAccessibilityText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
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
        const uploadFile = await editImageFile(file, editOptions);
        await api.uploadSticker(pack.id, uploadFile, uploadEmojis, accessibilityText);
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
      {files[0] ? <ImageEditControls file={files[0]} options={editOptions} onChange={setEditOptions} /> : null}
      {files.length > 1 ? <p className="upload-note">Files upload one by one in selection order.</p> : null}
    </section>
  );
}

function StickerTile({
  api,
  packId,
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
  packId: string;
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
  const [saving, setSaving] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementEditOptions, setReplacementEditOptions] = useState<ImageEditOptions>(defaultImageEditOptions);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    setEmojis(sticker.emojis.join(','));
    setAccessibilityText(sticker.accessibilityText ?? '');
  }, [sticker.accessibilityText, sticker.emojis]);

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
      const editedFile = await editImageFile(replacementFile, replacementEditOptions);
      await api.replaceStickerImage(packId, sticker.id, editedFile);
      setReplacementFile(null);
      setReplacementEditOptions(defaultImageEditOptions);
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setReplacing(false);
    }
  }

  const dirty = emojis !== sticker.emojis.join(',') || accessibilityText !== (sticker.accessibilityText ?? '');

  return (
    <article
      className={`sticker-tile ${isDragging ? 'dragging' : ''}`}
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
      <div className="sticker-preview">{url ? <img alt={sticker.accessibilityText ?? sticker.fileName} src={url} /> : null}</div>
      <div className="sticker-meta">
        <span>{formatBytes(sticker.sizeBytes)}</span>
        <span>{sticker.emojis.join(' ') || 'No emoji'}</span>
      </div>
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
          <IconButton label="Delete sticker" onClick={() => void deleteSticker()} danger>
            <Trash2 size={16} />
          </IconButton>
        </>
      ) : null}
    </article>
  );
}

type ImageEditOptions = {
  rotation: 0 | 90 | 180 | 270;
  cropSquare: boolean;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

const defaultImageEditOptions: ImageEditOptions = {
  rotation: 0,
  cropSquare: false,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

function ImageEditControls({
  file,
  options,
  onChange,
  compact = false,
}: {
  file: File;
  options: ImageEditOptions;
  onChange: (options: ImageEditOptions) => void;
  compact?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    editImageFile(file, options)
      .then((editedFile) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(editedFile);
        setPreviewUrl(objectUrl);
      })
      .catch(() => setPreviewUrl(null));

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, options]);

  function rotate(delta: 90 | -90) {
    const nextRotation = (((options.rotation + delta + 360) % 360) as ImageEditOptions['rotation']);
    onChange({ ...options, rotation: nextRotation });
  }

  return (
    <div className={`image-edit-controls ${compact ? 'compact' : ''}`}>
      {previewUrl ? (
        <div className="image-edit-preview">
          <img alt="Edited preview" src={previewUrl} />
        </div>
      ) : null}
      <div className="image-edit-actions">
        <IconButton label="Rotate left" onClick={() => rotate(-90)}>
          <RotateCcw size={16} />
        </IconButton>
        <IconButton label="Rotate right" onClick={() => rotate(90)}>
          <RotateCw size={16} />
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
      </div>
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

function roleLabel(role?: PackRole) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'VIEWER') return 'Viewer';
  return 'Private';
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

async function editImageFile(file: File, options: ImageEditOptions) {
  if (options.rotation === 0 && !options.cropSquare) return file;

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
  canvas.width = rotated ? sourceHeight : sourceWidth;
  canvas.height = rotated ? sourceWidth : sourceHeight;

  const context = canvas.getContext('2d');
  if (!context) return file;

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((options.rotation * Math.PI) / 180);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return file;

  return new File([blob], editedFileName(file), { type: 'image/png' });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

function editedFileName(file: File) {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'sticker';
  return `${baseName}-edited.png`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

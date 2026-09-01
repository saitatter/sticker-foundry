import { Archive, Download, ImagePlus, KeyRound, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  AdminSettings,
  AuditLogEntry,
  InstanceSettings,
  Pack,
  PackRole,
  RegistrationMode,
  StickerFoundryApi,
  Team,
  TeamMember,
  UserSession,
} from './api';
import { downloadBlob, IconButton } from './ui';

const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  instanceName: 'Sticker Foundry',
  instanceDescription: 'Self-hosted sticker pack management',
};

export type WorkspaceView = 'packs' | 'pack';

export function AccountDialog({
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
        setStorageQuotaMb(
          settings.storageQuotaBytes ? String(Math.round(settings.storageQuotaBytes / 1024 / 1024)) : '',
        );
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
      setSessions((current) =>
        current.map((session) => (session.id === id ? { ...session, revokedAt: new Date().toISOString() } : session)),
      );
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
                    {adminSettings.backgroundRemoval.aiCommandConfigured ? 'AI command configured' : 'AI fallback only'}
                  </small>
                </span>
                <span
                  className={
                    adminSettings.backgroundRemoval.aiCommandConfigured ? 'status-pill ready' : 'status-pill warning'
                  }
                >
                  {adminSettings.backgroundRemoval.aiCommandConfigured ? 'AI ready' : 'Threshold fallback'}
                </span>
              </div>
            ) : null}
            <label>
              Instance name
              <input maxLength={80} value={instanceName} onChange={(event) => setInstanceName(event.target.value)} />
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
              <select
                value={registrationMode}
                onChange={(event) => setRegistrationMode(event.target.value as RegistrationMode)}
              >
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
              <button
                className="secondary-button"
                disabled={exportingAudit}
                onClick={() => void exportAuditLog()}
                type="button"
              >
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
                  <small>
                    {entry.actor?.email ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}
                  </small>
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

export function PackCreateForm({
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
      const pack = await api.createPack({
        name,
        publisher,
        isPublic,
        requiresApproval,
        isAnimated,
        teamId: teamId || undefined,
      });
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

export function TeamCreateForm({
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

export function TeamWorkspacePanel({
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
              <small>
                {team.memberCount} members · {team.packCount} packs
              </small>
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
                      onChange={(event) =>
                        void changeMemberRole(member.id, event.target.value as Exclude<PackRole, 'OWNER'>)
                      }
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

export function AcceptInviteForm({
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

export function WorkspaceToolsDrawer({
  api,
  teams,
  onAccepted,
  onChanged,
  onClose,
  onError,
  onNotice,
  onPackCreated,
  onTeamCreated,
}: {
  api: StickerFoundryApi;
  teams: Team[];
  onAccepted: (pack: Pack) => Promise<void>;
  onChanged: () => Promise<void>;
  onClose: () => void;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
  onPackCreated: (pack: Pack) => void;
  onTeamCreated: (team: Team) => Promise<void>;
}) {
  return (
    <div className="modal-backdrop tools-drawer-backdrop" role="presentation">
      <aside
        aria-label="Create and join"
        aria-modal="true"
        className="modal-panel tools-drawer"
        id="workspace-tools"
        role="dialog"
      >
        <header className="tools-drawer-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>Create or join</h2>
          </div>
          <button className="ghost-button" onClick={onClose} type="button">
            Close
          </button>
        </header>
        <div className="tools-drawer-content">
          <PackCreateForm
            api={api}
            teams={teams}
            onCreated={(pack) => {
              onPackCreated(pack);
              onClose();
            }}
            onError={onError}
          />

          <TeamCreateForm
            api={api}
            onCreated={async (team) => {
              await onTeamCreated(team);
            }}
            onError={onError}
          />

          <TeamWorkspacePanel api={api} teams={teams} onChanged={onChanged} onError={onError} onNotice={onNotice} />

          <AcceptInviteForm
            api={api}
            onAccepted={async (pack) => {
              await onAccepted(pack);
              onClose();
            }}
            onError={onError}
          />
        </div>
      </aside>
    </div>
  );
}

export function WorkspaceNav({
  activeView,
  packCount,
  selectedPack,
  onOpenPack,
  onOpenPacks,
}: {
  activeView: WorkspaceView;
  packCount: number;
  selectedPack?: Pack | null;
  onOpenPack: () => void;
  onOpenPacks: () => void;
}) {
  return (
    <nav className="workspace-nav" aria-label="Workspace">
      <button
        aria-label="Open packs"
        className={`workspace-nav-row ${activeView === 'packs' ? 'active' : ''}`}
        onClick={onOpenPacks}
        type="button"
      >
        <Archive size={18} />
        <span>
          <strong>Packs</strong>
          <small>{packCount} total</small>
        </span>
      </button>
      {selectedPack ? (
        <button
          aria-label={`Open current pack ${selectedPack.name}`}
          className={`workspace-nav-row ${activeView === 'pack' ? 'active' : ''}`}
          onClick={onOpenPack}
          type="button"
        >
          <ImagePlus size={18} />
          <span>
            <strong>{selectedPack.name}</strong>
            <small>
              {selectedPack.stickerCount}/30 · {roleLabel(selectedPack.role)}
            </small>
          </span>
        </button>
      ) : null}
    </nav>
  );
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

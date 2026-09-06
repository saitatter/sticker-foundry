import { Archive, ImagePlus, KeyRound, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  InstanceSettings,
  Pack,
  PackRole,
  StickerFoundryApi,
  Team,
  TeamMember,
  UserSession,
} from './api';
import { IconButton } from './ui';
import { useConfirmDialog } from './components/ui/confirm-dialog';

export type WorkspaceView = 'packs' | 'pack';

export function AccountDialog({
  api,
  isAdmin,
  onClose,
  onOpenAdmin,
  onChanged,
  onError,
}: {
  api: StickerFoundryApi;
  isAdmin: boolean;
  onClose: () => void;
  onOpenAdmin: () => void;
  onChanged: (message: string, settings?: InstanceSettings) => void;
  onError: (error: unknown) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.sessions().then(setSessions).catch(onError);
  }, [api, onError]);

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

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel form-grid">
        <div className="section-heading">
          <h2>Account</h2>
          <div className="panel-actions">
            {isAdmin ? (
              <button className="secondary-button" onClick={onOpenAdmin} type="button">
                Admin settings
              </button>
            ) : null}
            <button className="secondary-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
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
  const { confirm, dialog } = useConfirmDialog();
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
    if (!selectedTeam) return;
    if (!(await confirm({
      title: 'Remove team member?',
      description: 'This member will lose access to the team and its shared packs.',
      confirmLabel: 'Remove member',
    }))) return;
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
                {team.memberCount} members Â· {team.packCount} packs
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
      {dialog}
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
              {selectedPack.stickerCount}/30 Â· {roleLabel(selectedPack.role)}
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

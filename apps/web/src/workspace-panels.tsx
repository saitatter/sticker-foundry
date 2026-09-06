import { Archive, ImagePlus, KeyRound, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  Pack,
  PackRole,
  StickerFoundryApi,
  Team,
  TeamMember,
} from './api';
import { LabeledIconButton as IconButton } from './components/ui/labeled-icon-button';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { CheckboxField, Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Select } from './components/ui/select';
import { useConfirmDialog } from './components/ui/confirm-dialog';

export type WorkspaceView = 'packs' | 'pack';
type WorkspaceNavView = WorkspaceView | 'admin' | 'account';

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
    <Card className="tool-panel">
      <div className="section-heading">
        <h2>New pack</h2>
        <Plus size={18} />
      </div>
      <form className="form-grid compact" onSubmit={submit}>
        <Field label="Name" htmlFor="new-pack-name">
          <Input id="new-pack-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required />
        </Field>
        <Field label="Publisher" htmlFor="new-pack-publisher">
          <Input id="new-pack-publisher" value={publisher} onChange={(event) => setPublisher(event.target.value)} maxLength={128} required />
        </Field>
        <CheckboxField label="Public">
          <Checkbox checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
        </CheckboxField>
        <CheckboxField label="Require approval">
          <Checkbox
            checked={requiresApproval}
            onChange={(event) => setRequiresApproval(event.target.checked)}
          />
        </CheckboxField>
        <CheckboxField label="Animated pack">
          <Checkbox checked={isAnimated} onChange={(event) => setIsAnimated(event.target.checked)} />
        </CheckboxField>
        {teams.length > 0 ? (
          <Field label="Team" htmlFor="new-pack-team">
            <Select id="new-pack-team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">Personal</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Button disabled={submitting} type="submit">
          <Plus size={17} />
          Create
        </Button>
      </form>
    </Card>
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
    <Card className="tool-panel">
      <div className="section-heading">
        <h2>New team</h2>
        <Users size={18} />
      </div>
      <form className="form-grid compact" onSubmit={submit}>
        <Field label="Name" htmlFor="new-team-name">
          <Input id="new-team-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={128} required />
        </Field>
        <Field label="Description" htmlFor="new-team-description">
          <Input id="new-team-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </Field>
        <Button disabled={submitting} type="submit" variant="secondary">
          <Users size={17} />
          Create team
        </Button>
      </form>
    </Card>
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
    <Card className="tool-panel team-panel">
      <div className="section-heading">
        <h2>Teams</h2>
        <Users size={18} />
      </div>
      <div className="team-list">
        {teams.map((team) => (
          <Button
            className={`team-row ${team.id === selectedTeam?.id ? 'selected' : ''}`}
            key={team.id}
            onClick={() => setSelectedTeamId(team.id)}
            type="button"
            variant="unstyled"
          >
            <span>
              <strong>{team.name}</strong>
              <small>
                {team.memberCount} members · {team.packCount} packs
              </small>
            </span>
            <span className="status-pill">{roleLabel(team.role)}</span>
          </Button>
        ))}
      </div>
      {selectedTeam?.canManage ? (
        <>
          <form className="form-grid compact team-member-form" onSubmit={addMember}>
            <Field label="Member email" htmlFor="team-member-email">
              <Input id="team-member-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </Field>
            <Field label="Role" htmlFor="team-member-role">
              <Select id="team-member-role" value={role} onChange={(event) => setRole(event.target.value as Exclude<PackRole, 'OWNER'>)}>
                <option value="EDITOR">Editor</option>
                <option value="VIEWER">Viewer</option>
              </Select>
            </Field>
            <Button disabled={saving || !email.trim()} type="submit" variant="secondary">
              <UserPlus size={17} />
              Add member
            </Button>
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
                    <Select
                      aria-label={`Role for ${member.user.email}`}
                      value={member.role}
                      onChange={(event) =>
                        void changeMemberRole(member.id, event.target.value as Exclude<PackRole, 'OWNER'>)
                      }
                    >
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </Select>
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
    </Card>
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
    <Card className="tool-panel">
      <div className="section-heading">
        <h2>Join pack</h2>
        <UserPlus size={18} />
      </div>
      <form className="form-grid compact" onSubmit={submit}>
        <Field label="Invite code" htmlFor="join-pack-code">
          <Input id="join-pack-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" />
        </Field>
        <Button disabled={!code.trim() || submitting} type="submit" variant="secondary">
          <UserPlus size={17} />
          Join
        </Button>
      </form>
    </Card>
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
          <Button className="ghost-button" onClick={onClose} type="button" variant="ghost">
            Close
          </Button>
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
  isAdmin,
  packCount,
  selectedPack,
  onOpenAccount,
  onOpenAdmin,
  onOpenPack,
  onOpenPacks,
}: {
  activeView: WorkspaceNavView;
  isAdmin: boolean;
  packCount: number;
  selectedPack?: Pack | null;
  onOpenAccount: () => void;
  onOpenAdmin: () => void;
  onOpenPack: () => void;
  onOpenPacks: () => void;
}) {
  return (
    <nav className="workspace-nav" aria-label="Workspace">
      <div className="workspace-nav-group">
        <p className="workspace-nav-label">Library</p>
        <Button
          aria-label="Open packs"
          className={`workspace-nav-row ${activeView === 'packs' ? 'active' : ''}`}
          onClick={onOpenPacks}
          type="button"
          variant="unstyled"
        >
          <Archive size={18} />
          <span>
            <strong>Packs</strong>
            <small>{packCount} total</small>
          </span>
        </Button>
        {selectedPack ? (
          <Button
            aria-label={`Open current pack ${selectedPack.name}`}
            className={`workspace-nav-row ${activeView === 'pack' ? 'active' : ''}`}
            onClick={onOpenPack}
            type="button"
            variant="unstyled"
          >
            <ImagePlus size={18} />
            <span>
              <strong>{selectedPack.name}</strong>
              <small>
                {selectedPack.stickerCount}/30 · {roleLabel(selectedPack.role)}
              </small>
            </span>
          </Button>
        ) : null}
      </div>
      {isAdmin ? (
        <div className="workspace-nav-group">
          <p className="workspace-nav-label">Administration</p>
          <Button
            aria-label="Open admin settings"
            className={`workspace-nav-row ${activeView === 'admin' ? 'active' : ''}`}
            onClick={onOpenAdmin}
            type="button"
            variant="unstyled"
          >
            <ShieldCheck size={18} />
            <span>
              <strong>Admin settings</strong>
              <small>Instance and audit</small>
            </span>
          </Button>
        </div>
      ) : null}
      <div className="workspace-nav-group">
        <p className="workspace-nav-label">Account</p>
        <Button
          aria-label="Open account settings"
          className={`workspace-nav-row ${activeView === 'account' ? 'active' : ''}`}
          onClick={onOpenAccount}
          type="button"
          variant="unstyled"
        >
          <KeyRound size={18} />
          <span>
            <strong>Account settings</strong>
            <small>Password and sessions</small>
          </span>
        </Button>
      </div>
    </nav>
  );
}

function roleLabel(role?: PackRole) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'VIEWER') return 'Viewer';
  return 'Private';
}

import {
  AlertCircle,
  Edit3,
  ImagePlus,
  RotateCcw,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { type DragEvent, type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AdminSettings,
  JobResponse,
  Pack,
  PackInvite,
  PackMember,
  PackRole,
  StickerFoundryApi,
} from './api';
import {
  cloneImageEditOptions,
  defaultImageEditOptions,
  editableUploadFile,
  ImageEditModal,
  type ImageEditOptions,
  stickerUploadOptionsFromEdit,
  UploadEditSummary,
} from './image-editor';
import { IconButton } from './ui';

export function CollaborationPanel({
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
                  onChange={(event) =>
                    void changeMemberRole(member.id, event.target.value as Exclude<PackRole, 'OWNER'>)
                  }
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
          {!loading && members.length === 0 ? (
            <span className="muted-row">Only the owner has access right now.</span>
          ) : null}
        </div>
        <form className="invite-form" onSubmit={createInvite}>
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="optional@email.com"
              type="email"
            />
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
            <select
              value={inviteFilter}
              onChange={(event) => setInviteFilter(event.target.value as typeof inviteFilter)}
            >
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
          {!loading && visibleInvites.length === 0 ? (
            <span className="muted-row">No invites match this filter.</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function PackEditForm({
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

export function TrayIconPanel({
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

export function UploadPanel({
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
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [jobActionId, setJobActionId] = useState<string | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<ImageEditOptions>(defaultImageEditOptions);
  const disabled = remainingSlots <= 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setUploadedCount(0);
    let completedCount = 0;
    try {
      const uploadEmojis = emojis
        .split(',')
        .map((emoji) => emoji.trim())
        .filter(Boolean)
        .slice(0, 3);

      for (const [index, file] of files.entries()) {
        const uploadFile = await editableUploadFile(file, pack.isAnimated, editOptions);
        const queuedJob = await api.queueStickerUpload(
          pack.id,
          uploadFile,
          uploadEmojis,
          accessibilityText,
          stickerUploadOptionsFromEdit(file, pack.isAnimated, editOptions),
        );
        setJobs((current) => [...current.filter((job) => job.id !== queuedJob.id), queuedJob].slice(-6));
        const completedJob = await api.waitForJob(queuedJob.id, (updatedJob) => {
          setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
        });
        if (completedJob.status !== 'COMPLETED') {
          throw new Error(completedJob.error ?? `Sticker job ${completedJob.status.toLowerCase()}`);
        }
        completedCount += 1;
        setUploadedCount(index + 1);
      }

      const count = files.length;
      setFiles([]);
      setEditOptions(defaultImageEditOptions);
      setEmojis('');
      setAccessibilityText('');
      await onChanged(count === 1 ? 'Sticker uploaded' : `${count} stickers uploaded`);
    } catch (error) {
      if (completedCount > 0) {
        try {
          await onChanged(`${completedCount} sticker${completedCount === 1 ? '' : 's'} uploaded`);
        } catch (refreshError) {
          onError(refreshError);
        }
      }
      onError(error);
    } finally {
      setUploading(false);
      setUploadedCount(0);
    }
  }

  async function cancelJob(jobId: string) {
    setJobActionId(jobId);
    try {
      const cancelledJob = await api.cancelJob(jobId);
      setJobs((current) => current.map((job) => (job.id === jobId ? cancelledJob : job)));
    } catch (error) {
      onError(error);
    } finally {
      setJobActionId(null);
    }
  }

  async function retryJob(jobId: string) {
    setJobActionId(jobId);
    try {
      const queuedJob = await api.retryJob(jobId);
      setJobs((current) => current.map((job) => (job.id === jobId ? queuedJob : job)));
      const completedJob = await api.waitForJob(jobId, (updatedJob) => {
        setJobs((current) => current.map((job) => (job.id === updatedJob.id ? updatedJob : job)));
      });
      if (completedJob.status !== 'COMPLETED') {
        throw new Error(completedJob.error ?? `Sticker job ${completedJob.status.toLowerCase()}`);
      }
      await onChanged('Sticker job completed');
    } catch (error) {
      onError(error);
    } finally {
      setJobActionId(null);
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
          Default emojis
          <input value={emojis} onChange={(event) => setEmojis(event.target.value)} placeholder="smile,laugh,heart" />
        </label>
        <label>
          Default alt text
          <input
            value={accessibilityText}
            onChange={(event) => setAccessibilityText(event.target.value)}
            maxLength={125}
            placeholder="Short sticker description"
          />
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
      {files.length > 1 ? (
        <p className="upload-note">Current edit settings and presets apply to all selected files in upload order.</p>
      ) : null}
      {jobs.length > 0 ? (
        <section className="job-progress-panel" aria-live="polite">
          <div className="section-heading">
            <h4>Media jobs</h4>
            <span className="counter">{jobs.filter((job) => job.status === 'COMPLETED').length}/{jobs.length}</span>
          </div>
          <div className="job-list">
            {jobs.map((job) => {
              const active = job.status === 'QUEUED' || job.status === 'PROCESSING';
              const retryable = job.status === 'FAILED' || job.status === 'CANCELLED';
              return (
                <div className={`job-row job-${job.status.toLowerCase()}`} key={job.id}>
                  <div className="job-row-heading">
                    <span>
                      <strong>{job.status === 'COMPLETED' ? 'Completed' : job.status.toLowerCase()}</strong>
                      <small>{job.progress}%</small>
                    </span>
                    {active ? (
                      <button
                        className="ghost-button"
                        disabled={jobActionId === job.id}
                        onClick={() => void cancelJob(job.id)}
                        type="button"
                      >
                        <AlertCircle size={15} />
                        Cancel
                      </button>
                    ) : retryable ? (
                      <button
                        className="ghost-button"
                        disabled={jobActionId === job.id}
                        onClick={() => void retryJob(job.id)}
                        type="button"
                      >
                        <RotateCcw size={15} />
                        Retry
                      </button>
                    ) : null}
                  </div>
                  <progress max="100" value={job.progress} />
                  {job.error ? <small className="job-error">{job.error}</small> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function roleLabel(role?: PackRole) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'VIEWER') return 'Viewer';
  return 'Private';
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

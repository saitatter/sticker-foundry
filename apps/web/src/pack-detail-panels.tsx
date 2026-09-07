import { AlertCircle, Edit3, ImagePlus, RotateCcw, Trash2, Upload, UserPlus, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { type DragEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { AdminSettings, JobResponse, Pack, PackInvite, PackMember, PackRole, StickerFoundryApi } from './api';
import {
  cloneImageEditOptions,
  defaultImageEditOptions,
  editableUploadFile,
  ImageEditModal,
  type ImageEditOptions,
  stickerUploadOptionsFromEdit,
  UploadEditSummary,
} from './image-editor';
import { LabeledIconButton as IconButton } from './components/ui/labeled-icon-button';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { CheckboxField, Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Select } from './components/ui/select';
import { StatusPill } from './components/ui/status-pill';
import { useJobQuery } from './features/jobs/queries';
import { queryKeys } from './lib/query-keys';
import { useConfirmDialog } from './components/ui/confirm-dialog';

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
  const { confirm, dialog } = useConfirmDialog();
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
    if (
      !(await confirm({
        title: 'Remove pack member?',
        description: 'This member will lose access to the pack immediately.',
        confirmLabel: 'Remove member',
      }))
    )
      return;
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
    <Card className="collaboration-panel">
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
          <Field label="Email" htmlFor="pack-invite-email">
            <Input
              id="pack-invite-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="optional@email.com"
              type="email"
            />
          </Field>
          <Field label="Role" htmlFor="pack-invite-role">
            <Select
              id="pack-invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Exclude<PackRole, 'OWNER'>)}
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </Select>
          </Field>
          <Field label="Expires" htmlFor="pack-invite-expires">
            <Input
              id="pack-invite-expires"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              type="datetime-local"
            />
          </Field>
          <Button disabled={creating} type="submit" variant="secondary">
            <UserPlus size={17} />
            Invite
          </Button>
          {invite ? (
            <Button className="invite-code-button" onClick={() => void copyInviteCode()} type="button" variant="ghost">
              <span>{invite.code}</span>
            </Button>
          ) : null}
        </form>
        <div className="invite-list">
          <div className="invite-filter-row">
            <Select
              value={inviteFilter}
              onChange={(event) => setInviteFilter(event.target.value as typeof inviteFilter)}
            >
              <option value="all">All invites</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="expired">Expired</option>
            </Select>
            <span className="counter">{visibleInvites.length}</span>
          </div>
          {visibleInvites.map((item) => (
            <div className="invite-row" key={item.id}>
              <span>
                <strong>{item.email ?? 'Open invite'}</strong>
                <small>{inviteStatusLabel(item)}</small>
              </span>
              {item.acceptedAt ? (
                <StatusPill className="ready">Accepted</StatusPill>
              ) : isExpiredInvite(item) ? (
                <StatusPill className="needs-work">Expired</StatusPill>
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
      {dialog}
    </Card>
  );
}

export const packSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(128),
  publisher: z.string().trim().min(1, 'Publisher is required').max(128),
  description: z.string().max(500),
  isPublic: z.boolean(),
  requiresApproval: z.boolean(),
  isAnimated: z.boolean(),
});

export type PackSettingsDraft = z.infer<typeof packSettingsSchema>;

export function PackSettingsPanel({
  api,
  canEdit,
  canManage,
  draft,
  errors,
  hasDirty,
  onDraftChange,
  onTrayIconFileChange,
  pack,
  trayIconFile,
}: {
  api: StickerFoundryApi;
  canEdit: boolean;
  canManage: boolean;
  draft: PackSettingsDraft;
  errors: Partial<Record<keyof PackSettingsDraft, string>>;
  hasDirty: boolean;
  onDraftChange: (draft: PackSettingsDraft) => void;
  onTrayIconFileChange: (file: File | null) => void;
  pack: Pack;
  trayIconFile: File | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      .catch(() => {
        if (alive) setUrl(null);
      });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, pack.id, pack.imageDataVersion]);

  useEffect(() => {
    if (!trayIconFile && fileInputRef.current) fileInputRef.current.value = '';
  }, [trayIconFile]);

  return (
    <Card className="pack-settings-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Pack configuration</p>
          <h3>Settings</h3>
        </div>
        <Edit3 size={18} />
      </div>

      <div className="pack-settings-layout">
        {canManage ? (
          <section aria-labelledby="pack-details-settings-title" className="pack-settings-section">
            <div className="panel-subheading">
              <div>
                <h4 id="pack-details-settings-title">Details</h4>
                <p>Name, visibility and export behavior.</p>
              </div>
              <Edit3 size={16} />
            </div>
            <div className="pack-settings-details-grid">
              <Field label="Name" htmlFor="pack-name">
                <Input
                  id="pack-name"
                  maxLength={128}
                  required
                  value={draft.name}
                  onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                />
                {errors.name ? <small className="field-error">{errors.name}</small> : null}
              </Field>
              <Field label="Publisher" htmlFor="pack-publisher">
                <Input
                  id="pack-publisher"
                  maxLength={128}
                  required
                  value={draft.publisher}
                  onChange={(event) => onDraftChange({ ...draft, publisher: event.target.value })}
                />
                {errors.publisher ? <small className="field-error">{errors.publisher}</small> : null}
              </Field>
              <Field label="Description" htmlFor="pack-description">
                <Input
                  id="pack-description"
                  maxLength={500}
                  value={draft.description}
                  onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
                />
                {errors.description ? <small className="field-error">{errors.description}</small> : null}
              </Field>
              <div className="pack-settings-toggles">
                <CheckboxField className="edit-toggle" label="Public">
                  <Checkbox
                    checked={draft.isPublic}
                    onChange={(event) => onDraftChange({ ...draft, isPublic: event.target.checked })}
                  />
                </CheckboxField>
                <CheckboxField className="edit-toggle" label="Require approval">
                  <Checkbox
                    checked={draft.requiresApproval}
                    onChange={(event) => onDraftChange({ ...draft, requiresApproval: event.target.checked })}
                  />
                </CheckboxField>
                <CheckboxField className="edit-toggle" label="Animated pack">
                  <Checkbox
                    checked={draft.isAnimated}
                    onChange={(event) => onDraftChange({ ...draft, isAnimated: event.target.checked })}
                  />
                </CheckboxField>
              </div>
            </div>
          </section>
        ) : null}

        {canEdit ? (
          <section aria-labelledby="tray-settings-title" className="pack-settings-section tray-settings-section">
            <div className="panel-subheading">
              <div>
                <h4 id="tray-settings-title">Tray icon</h4>
                <p>Shown as the pack thumbnail in WhatsApp.</p>
              </div>
              <ImagePlus size={16} />
            </div>
            <div className="tray-settings-content">
              <div aria-label="Current tray icon" className="tray-preview">
                {url ? <img alt={`${pack.name} tray icon`} src={url} /> : <ImagePlus size={24} />}
              </div>
              <div className="tray-settings-copy">
                <label className="tray-file-picker">
                  <input
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={(event) => onTrayIconFileChange(event.target.files?.[0] ?? null)}
                    type="file"
                  />
                  <Upload size={16} />
                  <span>{trayIconFile ? trayIconFile.name : 'Choose tray icon'}</span>
                </label>
                <small>Changes are staged until you press Save changes in the header.</small>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <div className="pack-settings-footer">
        <span className={hasDirty ? 'dirty-indicator' : 'saved-indicator'}>
          {hasDirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <span className="pack-settings-save-hint">Save applies details and tray icon together.</span>
      </div>
    </Card>
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
  const [uploadPlan, setUploadPlan] = useState<Array<{ file: File; index: number }>>([]);
  const [activeUpload, setActiveUpload] = useState<{ index: number; jobId: string } | null>(null);
  const [retryJobId, setRetryJobId] = useState<string | null>(null);
  const uploadStarting = useRef(false);
  const queryClient = useQueryClient();
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDraft, setEditorDraft] = useState<ImageEditOptions>(defaultImageEditOptions);
  const disabled = remainingSlots <= 0;
  const polledJobId = activeUpload?.jobId ?? retryJobId;
  const polledJobQuery = useJobQuery(api, polledJobId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) return;
    setUploading(true);
    setUploadedCount(0);
    setUploadPlan(files.map((file, index) => ({ file, index })));
  }

  useEffect(() => {
    if (!uploading || activeUpload || uploadPlan.length === 0 || uploadStarting.current) return;
    uploadStarting.current = true;
    const next = uploadPlan[0];
    const uploadEmojis = emojis
      .split(',')
      .map((emoji) => emoji.trim())
      .filter(Boolean)
      .slice(0, 3);

    void (async () => {
      try {
        const uploadFile = await editableUploadFile(next.file, pack.isAnimated, editOptions);
        const queuedJob = await api.queueStickerUpload(
          pack.id,
          uploadFile,
          uploadEmojis,
          accessibilityText,
          stickerUploadOptionsFromEdit(next.file, pack.isAnimated, editOptions),
        );
        queryClient.setQueryData(queryKeys.jobs.detail(queuedJob.id), queuedJob);
        setJobs((current) => [...current.filter((job) => job.id !== queuedJob.id), queuedJob].slice(-6));
        setActiveUpload({ index: next.index, jobId: queuedJob.id });
      } catch (error) {
        setUploadPlan([]);
        setUploading(false);
        onError(error);
      } finally {
        uploadStarting.current = false;
      }
    })();
  }, [
    accessibilityText,
    api,
    editOptions,
    emojis,
    onError,
    pack.id,
    pack.isAnimated,
    queryClient,
    uploadPlan,
    uploading,
    activeUpload,
  ]);

  useEffect(() => {
    const job = polledJobQuery.data;
    if (!job) return;
    setJobs((current) => [...current.filter((item) => item.id !== job.id), job].slice(-6));
    if (job.status !== 'COMPLETED' && job.status !== 'FAILED' && job.status !== 'CANCELLED') return;

    if (retryJobId === job.id) {
      setRetryJobId(null);
      setJobActionId(null);
      if (job.status === 'COMPLETED') void onChanged('Sticker job completed');
      else onError(new Error(job.error ?? `Sticker job ${job.status.toLowerCase()}`));
      return;
    }

    if (activeUpload?.jobId !== job.id) return;
    if (job.status === 'COMPLETED') {
      setUploadedCount(activeUpload.index + 1);
      setUploadPlan((current) => current.slice(1));
      setActiveUpload(null);
      return;
    }

    setUploadPlan([]);
    setActiveUpload(null);
    setUploading(false);
    onError(new Error(job.error ?? `Sticker job ${job.status.toLowerCase()}`));
  }, [activeUpload, onError, onChanged, polledJobQuery.data, retryJobId]);

  useEffect(() => {
    if (!uploading || activeUpload || uploadPlan.length > 0) return;
    const count = files.length;
    setUploading(false);
    setFiles([]);
    setEditOptions(defaultImageEditOptions);
    setEmojis('');
    setAccessibilityText('');
    void onChanged(count === 1 ? 'Sticker uploaded' : `${count} stickers uploaded`);
  }, [activeUpload, files.length, onChanged, uploadPlan.length, uploading]);

  async function cancelJob(jobId: string) {
    setJobActionId(jobId);
    try {
      const cancelledJob = await api.cancelJob(jobId);
      setJobs((current) => current.map((job) => (job.id === jobId ? cancelledJob : job)));
      queryClient.setQueryData(queryKeys.jobs.detail(jobId), cancelledJob);
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
      queryClient.setQueryData(queryKeys.jobs.detail(jobId), queuedJob);
      setRetryJobId(jobId);
    } catch (error) {
      onError(error);
    } finally {
      if (!retryJobId) setJobActionId(null);
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
    <div className="upload-panel">
      <form className="upload-form sticker-upload-form" onSubmit={submit}>
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
          <Input
            accept="image/*"
            disabled={disabled}
            multiple
            onChange={(event) => chooseFiles(event.target.files)}
            type="file"
          />
          <ImagePlus size={22} />
          <span>{fileLabel}</span>
        </label>
        <Field className="upload-default-field" label="Default emojis" htmlFor="upload-emojis">
          <Input
            id="upload-emojis"
            value={emojis}
            onChange={(event) => setEmojis(event.target.value)}
            placeholder="smile,laugh,heart"
          />
        </Field>
        <Field className="upload-default-field" label="Default alt text" htmlFor="upload-alt-text">
          <Input
            id="upload-alt-text"
            value={accessibilityText}
            onChange={(event) => setAccessibilityText(event.target.value)}
            maxLength={125}
            placeholder="Short sticker description"
          />
        </Field>
        <Button disabled={files.length === 0 || disabled || uploading} type="submit">
          <Upload size={17} />
          {uploading ? `Uploading ${uploadedCount}/${files.length}` : 'Upload'}
        </Button>
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
            <span className="counter">
              {jobs.filter((job) => job.status === 'COMPLETED').length}/{jobs.length}
            </span>
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
                      <Button
                        className="ghost-button"
                        disabled={jobActionId === job.id}
                        onClick={() => void cancelJob(job.id)}
                        type="button"
                        variant="ghost"
                      >
                        <AlertCircle size={15} />
                        Cancel
                      </Button>
                    ) : retryable ? (
                      <Button
                        className="ghost-button"
                        disabled={jobActionId === job.id}
                        onClick={() => void retryJob(job.id)}
                        type="button"
                        variant="ghost"
                      >
                        <RotateCcw size={15} />
                        Retry
                      </Button>
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
    </div>
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

import { Check, Copy, Edit3, GripVertical, ImagePlus, MessageSquare, MoveRight, Trash2 } from 'lucide-react';
import { type FormEvent, type MouseEvent, useEffect, useState } from 'react';
import type { AdminSettings, Pack, Sticker, StickerComment, StickerFoundryApi } from './api';
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
import { Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Metric } from './components/ui/metric';
import { Select } from './components/ui/select';
import { StatusPill } from './components/ui/status-pill';
import { Textarea } from './components/ui/textarea';

export function StickerTile({
  api,
  backgroundRemovalStatus,
  isAnimatedPack,
  packId,
  transferTargets,
  sticker,
  version,
  canEdit,
  isDragging,
  isSelected,
  onChanged,
  onDeleted,
  onError,
  onSelectedChange,
}: {
  api: StickerFoundryApi;
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
  isAnimatedPack: boolean;
  packId: string;
  transferTargets: Pack[];
  sticker: Sticker;
  version: string;
  canEdit: boolean;
  isDragging: boolean;
  isSelected: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onError: (error: unknown) => void;
  onSelectedChange: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [emojis, setEmojis] = useState(sticker.emojis.join(','));
  const [accessibilityText, setAccessibilityText] = useState(sticker.accessibilityText ?? '');
  const [reviewStatus, setReviewStatus] = useState(sticker.reviewStatus);
  const [saving, setSaving] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementEditOptions, setReplacementEditOptions] = useState<ImageEditOptions>(defaultImageEditOptions);
  const [replacementEditorOpen, setReplacementEditorOpen] = useState(false);
  const [replacementEditorDraft, setReplacementEditorDraft] = useState<ImageEditOptions>(defaultImageEditOptions);
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
      setReplacementEditorDraft(defaultImageEditOptions);
      setReplacementEditorOpen(false);
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
        <Field label="Target pack" htmlFor={`transfer-target-${sticker.id}`}>
          <Select
            id={`transfer-target-${sticker.id}`}
            value={transferTargetPackId}
            onChange={(event) => setTransferTargetPackId(event.target.value)}
          >
            <option value="">Choose pack</option>
            {transferTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} ({target.stickerCount}/30)
              </option>
            ))}
          </Select>
        </Field>
        <Button
          disabled={!transferTargetPackId}
          onClick={() => void transferSticker('copy')}
          type="button"
          variant="secondary"
        >
          <Copy size={16} />
          Copy
        </Button>
        <Button
          disabled={!transferTargetPackId}
          onClick={() => void transferSticker('move')}
          type="button"
          variant="secondary"
        >
          <MoveRight size={16} />
          Move
        </Button>
      </div>
    );
  }

  const dirty =
    emojis !== sticker.emojis.join(',') ||
    accessibilityText !== (sticker.accessibilityText ?? '') ||
    reviewStatus !== sticker.reviewStatus;

  return (
    <article className={`sticker-tile ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}>
      {canEdit ? (
        <div className="sticker-tile-toolbar">
          <span className="sticker-drag-handle" aria-hidden="true" title="Drag to reorder">
            <GripVertical size={16} />
          </span>
          <IconButton label="Delete sticker" onClick={() => void deleteSticker()} danger>
            <Trash2 size={16} />
          </IconButton>
        </div>
      ) : null}
      <div className="sticker-preview-wrap">
        <Button
          className="sticker-preview sticker-preview-button"
          onClick={() => setDetailOpen(true)}
          type="button"
          variant="unstyled"
        >
          {url ? <img alt={sticker.accessibilityText ?? sticker.fileName} src={url} /> : null}
        </Button>
        {canEdit ? (
          <button
            aria-label={isSelected ? 'Deselect sticker' : 'Select sticker'}
            className={`sticker-select-button ${isSelected ? 'selected' : ''}`}
            onClick={onSelectedChange}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            {isSelected ? <Check size={17} strokeWidth={3} /> : null}
          </button>
        ) : null}
      </div>
      <div className="sticker-meta">
        <span>{formatBytes(sticker.sizeBytes)}</span>
        <span>{sticker.emojis.join(' ') || 'No emoji'}</span>
      </div>
      <StatusPill className={reviewStatusClass(sticker.reviewStatus)}>
        {reviewStatusLabel(sticker.reviewStatus)}
      </StatusPill>
      <div className="sticker-tile-actions">
        <Button onClick={() => setDetailOpen(true)} type="button" variant="secondary">
          <Edit3 size={16} />
          Edit
        </Button>
        <Button
          className="sticker-comments-toggle"
          onClick={() => void toggleComments()}
          type="button"
          variant="secondary"
        >
          <MessageSquare size={16} />
          Comments
        </Button>
      </div>
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
            <Textarea
              maxLength={1000}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add a note"
              value={commentBody}
            />
            <Button disabled={!commentBody.trim() || commentSaving} type="submit" variant="secondary">
              <MessageSquare size={16} />
              Add
            </Button>
          </form>
        </div>
      ) : null}
      {detailOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            aria-label="Sticker detail"
            aria-modal="true"
            className="modal-panel sticker-detail-dialog"
            role="dialog"
          >
            <div className="section-heading">
              <h2>Sticker detail</h2>
              <Button onClick={() => setDetailOpen(false)} type="button" variant="secondary">
                Close
              </Button>
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
                  <Field label="Emojis" htmlFor={`sticker-emojis-${sticker.id}`}>
                    <Input
                      id={`sticker-emojis-${sticker.id}`}
                      value={emojis}
                      onChange={(event) => setEmojis(event.target.value)}
                      placeholder="smile,laugh"
                    />
                  </Field>
                  <Field label="Alt text" htmlFor={`sticker-alt-${sticker.id}`}>
                    <Input
                      id={`sticker-alt-${sticker.id}`}
                      value={accessibilityText}
                      onChange={(event) => setAccessibilityText(event.target.value)}
                      maxLength={125}
                    />
                  </Field>
                  <Field label="Review" htmlFor={`sticker-review-${sticker.id}`}>
                    <Select
                      id={`sticker-review-${sticker.id}`}
                      value={reviewStatus}
                      onChange={(event) => setReviewStatus(event.target.value as Sticker['reviewStatus'])}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="APPROVED">Approved</option>
                      <option value="NEEDS_WORK">Needs work</option>
                    </Select>
                  </Field>
                  <Button disabled={!dirty || saving} type="submit">
                    <Edit3 size={17} />
                    Save metadata
                  </Button>
                </form>
              ) : null}
              {canEdit ? (
                <form className="sticker-replace-form" onSubmit={replaceImage}>
                  <label className="file-drop sticker-replace-drop">
                    <Input
                      accept="image/*"
                      onChange={(event) => {
                        setReplacementFile(event.target.files?.[0] ?? null);
                        setReplacementEditOptions(defaultImageEditOptions);
                        setReplacementEditorDraft(defaultImageEditOptions);
                        setReplacementEditorOpen(false);
                      }}
                      type="file"
                    />
                    <ImagePlus size={18} />
                    <span>{replacementFile ? replacementFile.name : 'Replace image'}</span>
                  </label>
                  <Button
                    className="sticker-save"
                    disabled={!replacementFile || replacing}
                    type="submit"
                    variant="secondary"
                  >
                    {replacing ? 'Replacing' : 'Replace'}
                  </Button>
                </form>
              ) : null}
              {replacementFile ? (
                <UploadEditSummary
                  file={replacementFile}
                  fileCount={1}
                  isAnimatedPack={isAnimatedPack}
                  options={replacementEditOptions}
                  onEdit={() => {
                    setReplacementEditorDraft(cloneImageEditOptions(replacementEditOptions));
                    setReplacementEditorOpen(true);
                  }}
                  onReset={() => setReplacementEditOptions(defaultImageEditOptions)}
                />
              ) : null}
              {replacementEditorOpen && replacementFile ? (
                <ImageEditModal
                  backgroundRemovalStatus={backgroundRemovalStatus}
                  file={replacementFile}
                  options={replacementEditorDraft}
                  onChange={setReplacementEditorDraft}
                  onApply={() => {
                    setReplacementEditOptions(cloneImageEditOptions(replacementEditorDraft));
                    setReplacementEditorOpen(false);
                  }}
                  onClose={() => setReplacementEditorOpen(false)}
                  onReset={() => setReplacementEditorDraft(defaultImageEditOptions)}
                />
              ) : null}
              {renderTransferControls()}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function reviewStatusLabel(status: Sticker['reviewStatus']) {
  if (status === 'APPROVED') return 'Approved';
  if (status === 'NEEDS_WORK') return 'Needs work';
  return 'Pending';
}

function reviewStatusClass(status: Sticker['reviewStatus']) {
  if (status === 'APPROVED') return 'ready';
  if (status === 'NEEDS_WORK') return 'needs-work';
  return 'pending';
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

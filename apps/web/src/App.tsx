import {
  ArrowDown,
  ArrowUp,
  Archive,
  AlertCircle,
  CheckCircle2,
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
  Trash2,
  Upload,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, Pack, Sticker, StickerFoundryApi, User } from './api';

const TOKEN_KEY = 'stickerfoundry.token';
const DEMO_EMAIL = 'demo@stickerfoundry.local';
const DEMO_PASSWORD = 'stickerfoundry123';

type Notice = {
  tone: 'info' | 'error' | 'success';
  text: string;
};

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);

  const api = useMemo(() => new StickerFoundryApi(() => token), [token]);

  const reportError = useCallback((error: unknown) => {
    const text = error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong';
    setNotice({ tone: 'error', text });
  }, []);

  const refreshPacks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const nextPacks = await api.packs();
      setPacks(nextPacks);
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
    if (!token) return;
    api
      .me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      });
  }, [api, token]);

  useEffect(() => {
    void refreshPacks();
  }, [refreshPacks]);

  useEffect(() => {
    void refreshSelectedPack();
  }, [refreshSelectedPack]);

  const saveSession = (authToken: string, authUser: User) => {
    localStorage.setItem(TOKEN_KEY, authToken);
    setToken(authToken);
    setUser(authUser);
    setNotice({ tone: 'success', text: 'Signed in' });
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setPacks([]);
    setSelectedPack(null);
    setSelectedPackId(null);
  };

  if (!token) {
    return <AuthScreen api={api} onSignedIn={saveSession} onError={reportError} notice={notice} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SF</span>
          <div>
            <h1>StickerFoundry</h1>
            <p>{user?.email ?? 'Signed in'}</p>
          </div>
        </div>
        <div className="topbar-actions">
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
            onCreated={(pack) => {
              setPacks((current) => [pack, ...current]);
              setSelectedPackId(pack.id);
              setNotice({ tone: 'success', text: 'Pack created' });
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
              onError={reportError}
              onNotice={(message) => setNotice({ tone: 'success', text: message })}
            />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
    </div>
  );
}

function AuthScreen({
  api,
  onSignedIn,
  onError,
  notice,
}: {
  api: StickerFoundryApi;
  onSignedIn: (token: string, user: User) => void;
  onError: (error: unknown) => void;
  notice: Notice | null;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response =
        mode === 'register'
          ? await api.register(email, displayName || email.split('@')[0], password)
          : await api.login(email, password);
      onSignedIn(response.accessToken, response.user);
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
    setPassword(DEMO_PASSWORD);
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <span className="brand-mark">SF</span>
          <div>
            <h1>StickerFoundry</h1>
            <p>Self-hosted sticker pack management</p>
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
  onCreated,
  onError,
}: {
  api: StickerFoundryApi;
  onCreated: (pack: Pack) => void;
  onError: (error: unknown) => void;
}) {
  const [name, setName] = useState('');
  const [publisher, setPublisher] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const pack = await api.createPack({ name, publisher, isPublic });
      setName('');
      setPublisher('');
      setIsPublic(false);
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
        <button className="primary-button" disabled={submitting} type="submit">
          <Plus size={17} />
          Create
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
  return (
    <section className="pack-list" aria-label="Sticker packs">
      <div className="section-heading">
        <h2>Packs</h2>
        <span className="counter">{loading ? '...' : packs.length}</span>
      </div>
      <div className="pack-list-scroll">
        {packs.length === 0 && !loading ? (
          <div className="empty-pack-list">
            <Archive size={22} />
            <span>No packs</span>
          </div>
        ) : null}
        {packs.map((pack) => (
          <button
            className={`pack-row ${pack.id === selectedPackId ? 'selected' : ''}`}
            key={pack.id}
            onClick={() => onSelect(pack.id)}
            type="button"
          >
            <span className="pack-row-main">
              <strong>{pack.name}</strong>
              <span>{pack.publisher}</span>
            </span>
            <span className="pack-row-meta">
              {pack.isPublic ? <Globe2 size={15} /> : <Lock size={15} />}
              {pack.stickerCount}/30
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
  onChanged,
  onDeleted,
  onError,
  onNotice,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  onChanged: (message: string) => Promise<void>;
  onDeleted: () => void;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
}) {
  const stickers = pack.stickers ?? [];
  const canExport = stickers.length >= 3 && stickers.length <= 30;
  const [exporting, setExporting] = useState(false);
  const [contentsPreview, setContentsPreview] = useState<string | null>(null);
  const [loadingContents, setLoadingContents] = useState(false);
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(null);

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
          <IconButton label="Delete pack" onClick={() => void deletePack()} danger>
            <Trash2 size={18} />
          </IconButton>
        </div>
      </div>

      <div className="stats-grid">
        <Metric label="Stickers" value={`${stickers.length}/30`} />
        <Metric label="Version" value={pack.imageDataVersion} />
        <Metric label="Updated" value={new Date(pack.updatedAt).toLocaleDateString()} />
      </div>

      <ExportReadiness stickerCount={stickers.length} canExport={canExport} />

      {contentsPreview ? <pre className="contents-preview">{contentsPreview}</pre> : null}

      <PackEditForm api={api} pack={pack} onChanged={onChanged} onError={onError} />

      <TrayIconPanel api={api} pack={pack} onChanged={onChanged} onError={onError} />

      <UploadPanel
        api={api}
        pack={pack}
        remainingSlots={Math.max(0, 30 - stickers.length)}
        onChanged={onChanged}
        onError={onError}
      />

      <section className="stickers-section">
        <div className="section-heading">
          <h3>Stickers</h3>
          <Archive size={18} />
        </div>
        {stickers.length > 0 ? (
          <div className="sticker-grid">
            {stickers.map((sticker, index) => (
              <StickerTile
                api={api}
                key={sticker.id}
                packId={pack.id}
                sticker={sticker}
                version={pack.imageDataVersion}
                canMoveDown={index < stickers.length - 1}
                canMoveUp={index > 0}
                isDragging={draggingStickerId === sticker.id}
                onChanged={() => onChanged('Sticker updated')}
                onDeleted={() => onChanged('Sticker deleted')}
                onDragEnd={() => setDraggingStickerId(null)}
                onDragStart={() => setDraggingStickerId(sticker.id)}
                onDrop={() => void reorderStickerTo(sticker.id)}
                onError={onError}
                onMoveDown={() => moveSticker(sticker.id, 1)}
                onMoveUp={() => moveSticker(sticker.id, -1)}
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
  const [emojis, setEmojis] = useState('');
  const [accessibilityText, setAccessibilityText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
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
        await api.uploadSticker(pack.id, file, uploadEmojis, accessibilityText);
        setUploadedCount(index + 1);
      }

      const count = files.length;
      setFiles([]);
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
        <label className="file-drop">
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
      {files.length > 1 ? <p className="upload-note">Files upload one by one in selection order.</p> : null}
    </section>
  );
}

function StickerTile({
  api,
  packId,
  sticker,
  version,
  canMoveDown,
  canMoveUp,
  isDragging,
  onChanged,
  onDeleted,
  onDragEnd,
  onDragStart,
  onDrop,
  onError,
  onMoveDown,
  onMoveUp,
}: {
  api: StickerFoundryApi;
  packId: string;
  sticker: Sticker;
  version: string;
  canMoveDown: boolean;
  canMoveUp: boolean;
  isDragging: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onError: (error: unknown) => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [emojis, setEmojis] = useState(sticker.emojis.join(','));
  const [accessibilityText, setAccessibilityText] = useState(sticker.accessibilityText ?? '');
  const [saving, setSaving] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
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
      await api.replaceStickerImage(packId, sticker.id, replacementFile);
      setReplacementFile(null);
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
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
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
      <div className="sticker-preview">{url ? <img alt={sticker.accessibilityText ?? sticker.fileName} src={url} /> : null}</div>
      <div className="sticker-meta">
        <span>{formatBytes(sticker.sizeBytes)}</span>
        <span>{sticker.emojis.join(' ') || 'No emoji'}</span>
      </div>
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
      <IconButton label="Delete sticker" onClick={() => void deleteSticker()} danger>
        <Trash2 size={16} />
      </IconButton>
    </article>
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

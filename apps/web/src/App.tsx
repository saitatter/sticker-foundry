import {
  Archive,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Globe2,
  ImagePlus,
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
}: {
  api: StickerFoundryApi;
  pack: Pack;
  onChanged: (message: string) => Promise<void>;
  onDeleted: () => void;
  onError: (error: unknown) => void;
}) {
  const stickers = pack.stickers ?? [];
  const canExport = stickers.length >= 3 && stickers.length <= 30;

  async function exportPack() {
    try {
      const blob = await api.exportPack(pack.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${pack.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${pack.id.slice(0, 8)}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(error);
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

  return (
    <section className="detail">
      <div className="detail-header">
        <div>
          <p className="eyebrow">{pack.isPublic ? 'Public pack' : 'Private pack'}</p>
          <h2>{pack.name}</h2>
          <p>{pack.publisher}</p>
        </div>
        <div className="detail-actions">
          <button className="secondary-button" disabled={!canExport} onClick={() => void exportPack()} type="button">
            <Download size={17} />
            Export
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

      <PackEditForm api={api} pack={pack} onChanged={onChanged} onError={onError} />

      <TrayIconPanel api={api} pack={pack} onChanged={onChanged} onError={onError} />

      <UploadPanel api={api} pack={pack} disabled={stickers.length >= 30} onChanged={onChanged} onError={onError} />

      <section className="stickers-section">
        <div className="section-heading">
          <h3>Stickers</h3>
          <Archive size={18} />
        </div>
        {stickers.length > 0 ? (
          <div className="sticker-grid">
            {stickers.map((sticker) => (
              <StickerTile
                api={api}
                key={sticker.id}
                packId={pack.id}
                sticker={sticker}
                onDeleted={() => onChanged('Sticker deleted')}
                onError={onError}
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
  disabled,
  onChanged,
  onError,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  disabled: boolean;
  onChanged: (message: string) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [emojis, setEmojis] = useState('');
  const [accessibilityText, setAccessibilityText] = useState('');
  const [uploading, setUploading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadSticker(
        pack.id,
        file,
        emojis
          .split(',')
          .map((emoji) => emoji.trim())
          .filter(Boolean)
          .slice(0, 3),
        accessibilityText,
      );
      setFile(null);
      setEmojis('');
      setAccessibilityText('');
      await onChanged('Sticker uploaded');
    } catch (error) {
      onError(error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="upload-panel">
      <div className="section-heading">
        <h3>Upload</h3>
        <Upload size={18} />
      </div>
      <form className="upload-form" onSubmit={submit}>
        <label className="file-drop">
          <input
            accept="image/*"
            disabled={disabled}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            type="file"
          />
          <ImagePlus size={22} />
          <span>{file ? file.name : 'Choose image'}</span>
        </label>
        <label>
          Emojis
          <input value={emojis} onChange={(event) => setEmojis(event.target.value)} placeholder="smile,laugh" />
        </label>
        <label>
          Alt text
          <input value={accessibilityText} onChange={(event) => setAccessibilityText(event.target.value)} maxLength={125} />
        </label>
        <button className="primary-button" disabled={!file || disabled || uploading} type="submit">
          <Upload size={17} />
          Upload
        </button>
      </form>
    </section>
  );
}

function StickerTile({
  api,
  packId,
  sticker,
  onDeleted,
  onError,
}: {
  api: StickerFoundryApi;
  packId: string;
  sticker: Sticker;
  onDeleted: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

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
  }, [api, onError, packId, sticker.id]);

  async function deleteSticker() {
    try {
      await api.deleteSticker(packId, sticker.id);
      await onDeleted();
    } catch (error) {
      onError(error);
    }
  }

  return (
    <article className="sticker-tile">
      <div className="sticker-preview">{url ? <img alt={sticker.accessibilityText ?? sticker.fileName} src={url} /> : null}</div>
      <div className="sticker-meta">
        <span>{formatBytes(sticker.sizeBytes)}</span>
        <span>{sticker.emojis.join(' ') || 'No emoji'}</span>
      </div>
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
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button className={`icon-button ${danger ? 'danger' : ''}`} onClick={onClick} title={label} type="button" aria-label={label}>
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

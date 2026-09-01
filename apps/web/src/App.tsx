import { ImagePlus, KeyRound, LogOut, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminSettings, ApiError, AuthResponse, InstanceSettings, Pack, StickerFoundryApi, Team, User } from './api';
import { PackLibrary } from './pack-library';
import { AuthScreen, ResetPasswordScreen, SharePage } from './screens';
import { PackDetail } from './pack-detail';
import { AccountDialog, WorkspaceNav, WorkspaceToolsDrawer } from './workspace-panels';
import { BrandMark, IconButton, NoticeBar, type Notice } from './ui';

const TOKEN_KEY = 'stickerfoundry.token';
const REFRESH_TOKEN_KEY = 'stickerfoundry.refreshToken';
const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  instanceName: 'Sticker Foundry',
  instanceDescription: 'Self-hosted sticker pack management',
};

type WorkspaceView = 'packs' | 'pack';
export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [instanceSettings, setInstanceSettings] = useState<InstanceSettings>(DEFAULT_INSTANCE_SETTINGS);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('packs');
  const [backgroundRemovalStatus, setBackgroundRemovalStatus] = useState<
    AdminSettings['backgroundRemoval'] | undefined
  >(undefined);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const passwordResetToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname === '/reset-password' ? params.get('token') : null;
  }, []);

  const saveAuth = useCallback((auth: AuthResponse | null) => {
    if (!auth) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      setToken(null);
      setUser(null);
      return;
    }

    localStorage.setItem(TOKEN_KEY, auth.accessToken);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(auth.accessToken);
    setUser(auth.user);
  }, []);

  const api = useMemo(
    () =>
      new StickerFoundryApi(
        () => token,
        saveAuth,
      ),
    [saveAuth, token],
  );

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
      setSelectedPackId((current) => (current && nextPacks.some((pack) => pack.id === current) ? current : null));
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
    api
      .instanceSettings()
      .then(setInstanceSettings)
      .catch(() => undefined);
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
    api
      .adminSettings()
      .then((settings) => setBackgroundRemovalStatus(settings.backgroundRemoval))
      .catch(reportError);
  }, [api, reportError, user?.isAdmin]);

  useEffect(() => {
    void refreshSelectedPack();
  }, [refreshSelectedPack]);

  const sharePackId = sharePackIdFromPath();
  if (sharePackId) {
    return (
      <SharePage
        api={api}
        instanceSettings={instanceSettings}
        packId={sharePackId}
        onError={reportError}
        notice={notice}
      />
    );
  }

  const saveSession = (auth: AuthResponse) => {
    saveAuth(auth);
    setNotice({ tone: 'success', text: 'Signed in' });
  };

  const signOut = () => {
    void api.logout().catch(() => undefined);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(null);
    setUser(null);
    setPacks([]);
    setSelectedPack(null);
    setSelectedPackId(null);
    setWorkspaceView('packs');
    setBackgroundRemovalStatus(undefined);
  };

  const openPacksView = () => {
    setWorkspaceView('packs');
    setShowMobileTools(false);
  };

  const openPack = (packId: string) => {
    setSelectedPackId(packId);
    setWorkspaceView('pack');
    setShowMobileTools(false);
  };

  const selectedPackSummary = packs.find((pack) => pack.id === selectedPackId) ?? selectedPack;

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
          <BrandMark />
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
          <WorkspaceNav
            activeView={workspaceView}
            packCount={packs.length}
            selectedPack={selectedPackSummary}
            onOpenPack={() => {
              if (selectedPackId) openPack(selectedPackId);
            }}
            onOpenPacks={openPacksView}
          />

          <button
            aria-controls="workspace-tools"
            aria-expanded={showMobileTools}
            className="secondary-button workspace-tools-trigger"
            onClick={() => setShowMobileTools((visible) => !visible)}
            type="button"
          >
            <Plus size={17} />
            Create or join
          </button>
        </aside>

        <main className="content">
          {notice ? <NoticeBar notice={notice} onClose={() => setNotice(null)} /> : null}
          {workspaceView === 'packs' ? (
            <PackLibrary
              api={api}
              packs={packs}
              selectedPackId={selectedPackId}
              loading={loading}
              onSelect={openPack}
            />
          ) : selectedPack ? (
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
                setWorkspaceView('packs');
                setNotice({ tone: 'success', text: 'Pack deleted' });
              }}
              onCloned={(pack) => {
                setPacks((current) => [pack, ...current]);
                openPack(pack.id);
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
      {showMobileTools ? (
        <WorkspaceToolsDrawer
          api={api}
          teams={teams}
          onAccepted={async (pack) => {
            await refreshPacks();
            openPack(pack.id);
            setNotice({ tone: 'success', text: 'Invite accepted' });
          }}
          onChanged={refreshPacks}
          onClose={() => setShowMobileTools(false)}
          onError={reportError}
          onNotice={(message) => setNotice({ tone: 'success', text: message })}
          onPackCreated={(pack) => {
            setPacks((current) => [pack, ...current]);
            openPack(pack.id);
            setNotice({ tone: 'success', text: 'Pack created' });
          }}
          onTeamCreated={async (team) => {
            setTeams((current) => [team, ...current].sort((left, right) => left.name.localeCompare(right.name)));
            setNotice({ tone: 'success', text: 'Team created' });
          }}
        />
      ) : null}
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

function EmptyState() {
  return (
    <section className="empty-state">
      <ImagePlus size={34} />
      <h2>No pack selected</h2>
      <p>Create or select a pack.</p>
    </section>
  );
}

function sharePackIdFromPath() {
  const match = window.location.pathname.match(/^\/share\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

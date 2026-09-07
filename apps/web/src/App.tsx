import { ImagePlus, KeyRound, LogOut, Plus, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, AuthResponse, InstanceSettings, Pack, StickerFoundryApi, Team, User } from './api';
import { useMeQuery } from './features/auth/queries';
import { useAdminSettingsQuery } from './features/admin/queries';
import { usePackQuery, usePacksQuery } from './features/packs/queries';
import { useInstanceQuery } from './features/settings/queries';
import { useTeamsQuery } from './features/teams/queries';
import { queryKeys } from './lib/query-keys';
import { PackLibrary } from './pack-library';
import { AuthScreen, ResetPasswordScreen, SharePage } from './screens';
import { PackDetail } from './pack-detail';
import { AdminSettingsPage } from './admin-settings-page';
import { AccountSettingsPage } from './account-settings-page';
import { WorkspaceNav, WorkspaceToolsDrawer } from './workspace-panels';
import { ThemeToggle } from './components/layout/theme-toggle';
import { AppShell } from './components/layout/app-shell';
import { Button } from './components/ui/button';
import { EmptyState as EmptyStateComponent } from './components/ui/empty-state';
import { clearAccessToken, getAccessToken, setAccessToken } from './lib/api/auth-session';
import { BrandMark } from './components/layout/brand-mark';
import { LabeledIconButton as IconButton } from './components/ui/labeled-icon-button';
import { NoticeBar } from './components/ui/notice-bar';
import type { Notice } from './ui-types';

const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  instanceName: 'Sticker Foundry',
  instanceDescription: 'Self-hosted sticker pack management',
};

export type AppRoute =
  | { kind: 'login' }
  | { kind: 'settings'; section: 'account' | 'security' | 'instance' | 'processing' | 'audit' | 'admin' }
  | { kind: 'team'; teamId: string }
  | {
      kind: 'workspace';
      view: 'packs' | 'pack';
      packId?: string;
      section?: 'overview' | 'stickers' | 'collaboration' | 'activity' | 'settings';
      filters?: {
        q?: string;
        visibility?: 'all' | 'public' | 'private' | 'ready' | 'needs-work';
        sort?: 'updated' | 'name' | 'stickers';
      };
    }
  | { kind: 'share'; packId: string }
  | { kind: 'reset'; token: string | null };

export function App({ route }: { route: AppRoute }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => getAccessToken());
  const [authBootstrapped, setAuthBootstrapped] = useState(() => Boolean(getAccessToken()));
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const selectedPackId = route.kind === 'workspace' && route.view === 'pack' ? (route.packId ?? null) : null;
  const workspaceView = route.kind === 'workspace' ? route.view : 'packs';
  const sidebarView = route.kind === 'settings' ? (route.section === 'admin' ? 'admin' : 'account') : workspaceView;
  const isPublicRoute = route.kind === 'login' || route.kind === 'share' || route.kind === 'reset';

  const saveAuth = useCallback((auth: AuthResponse | null) => {
    if (!auth) {
      clearAccessToken();
      setToken(null);
      setSessionUser(null);
      return;
    }

    setAccessToken(auth.accessToken);
    setToken(auth.accessToken);
    setSessionUser(auth.user);
  }, []);

  const api = useMemo(() => new StickerFoundryApi(() => token, saveAuth), [saveAuth, token]);
  const packsQuery = usePacksQuery(api, Boolean(token));
  const teamsQuery = useTeamsQuery(api, Boolean(token));
  const selectedPackQuery = usePackQuery(api, selectedPackId);
  const meQuery = useMeQuery(api, Boolean(token));
  const instanceQuery = useInstanceQuery(api);
  const adminSettingsQuery = useAdminSettingsQuery(
    api,
    Boolean(token && (meQuery.data?.isAdmin || sessionUser?.isAdmin)),
  );
  const packs = packsQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const selectedPack = selectedPackQuery.data ?? null;
  const user = meQuery.data ?? sessionUser;
  const instanceSettings = instanceQuery.data ?? DEFAULT_INSTANCE_SETTINGS;
  const backgroundRemovalStatus = adminSettingsQuery.data?.backgroundRemoval;

  const reportError = useCallback((error: unknown) => {
    const text = error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong';
    setNotice({ tone: 'error', text });
  }, []);

  const refetchWorkspaceQueries = useCallback(async () => {
    if (!token) return;
    await Promise.all([packsQuery.refetch(), teamsQuery.refetch()]);
  }, [packsQuery.refetch, teamsQuery.refetch, token]);

  const invalidateWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.packs.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all }),
      selectedPackId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.packs.detail(selectedPackId) })
        : Promise.resolve(),
    ]);
  }, [queryClient, selectedPackId]);

  useEffect(() => {
    if (token || isPublicRoute) return;
    void api
      .refreshSession()
      .then((auth) => {
        if (auth) saveAuth(auth);
      })
      .catch(() => undefined)
      .finally(() => setAuthBootstrapped(true));
  }, [api, isPublicRoute, saveAuth, token]);

  useEffect(() => {
    if (token) setAuthBootstrapped(true);
  }, [token]);

  useEffect(() => {
    const protectedRoute = route.kind === 'workspace' || route.kind === 'settings' || route.kind === 'team';
    if (protectedRoute && authBootstrapped && !token) {
      void navigate({ to: '/login' });
    }
  }, [authBootstrapped, navigate, route.kind, token]);

  if (route.kind === 'share') {
    return (
      <SharePage
        api={api}
        instanceSettings={instanceSettings}
        packId={route.packId}
        onError={reportError}
        notice={notice}
      />
    );
  }

  if (route.kind === 'reset' && route.token) {
    return (
      <ResetPasswordScreen
        api={api}
        instanceSettings={instanceSettings}
        token={route.token}
        onChanged={() => {
          void navigate({ to: '/login' });
          setNotice({ tone: 'success', text: 'Password reset complete. You can log in now.' });
        }}
        onError={reportError}
        notice={notice}
      />
    );
  }

  const saveSession = (auth: AuthResponse) => {
    saveAuth(auth);
    setNotice({ tone: 'success', text: 'Signed in' });
    void navigate({ to: '/app/packs', search: { q: undefined, visibility: undefined, sort: undefined } });
  };

  const signOut = () => {
    void api.logout().catch(() => undefined);
    clearAccessToken();
    setToken(null);
    setSessionUser(null);
    queryClient.removeQueries({ queryKey: queryKeys.packs.all });
    queryClient.removeQueries({ queryKey: queryKeys.teams.all });
    queryClient.removeQueries({ queryKey: queryKeys.me });
    void navigate({ to: '/login' });
  };

  const openPacksView = () => {
    setShowMobileTools(false);
    void navigate({ to: '/app/packs', search: { q: undefined, visibility: undefined, sort: undefined } });
  };

  const openPack = (packId: string) => {
    setShowMobileTools(false);
    void navigate({ to: '/app/packs/$packId', params: { packId } });
  };

  const loading = packsQuery.isPending;
  const selectedPackSummary = packs.find((pack) => pack.id === selectedPackId) ?? selectedPack;

  if (!isPublicRoute && !authBootstrapped) {
    return (
      <main aria-busy="true" className="auth-loading-screen">
        <div className="auth-loading-card">
          <BrandMark />
          <div>
            <strong>Restoring your session</strong>
            <span>Just a moment…</span>
          </div>
        </div>
      </main>
    );
  }

  if (!token) {
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
    <AppShell
      actions={
        <>
          <ThemeToggle />
          <IconButton label="Account settings" onClick={() => void navigate({ to: '/app/settings/account' })}>
            <KeyRound size={18} />
          </IconButton>
          <IconButton label="Refresh packs" onClick={() => void refetchWorkspaceQueries()}>
            <RefreshCw size={18} />
          </IconButton>
          <IconButton label="Sign out" onClick={signOut}>
            <LogOut size={18} />
          </IconButton>
        </>
      }
      brand={
        <>
          <BrandMark />
          <div>
            <h1>{instanceSettings.instanceName}</h1>
            <p>{user?.email ?? 'Signed in'}</p>
          </div>
        </>
      }
      overlays={
        showMobileTools || route.kind === 'team' ? (
          <WorkspaceToolsDrawer
            api={api}
            teams={teams}
            onAccepted={async (pack) => {
              await invalidateWorkspace();
              openPack(pack.id);
              setNotice({ tone: 'success', text: 'Invite accepted' });
            }}
            onChanged={invalidateWorkspace}
            onClose={() => {
              setShowMobileTools(false);
              if (route.kind === 'team')
                void navigate({ to: '/app/packs', search: { q: undefined, visibility: undefined, sort: undefined } });
            }}
            onError={reportError}
            onNotice={(message) => setNotice({ tone: 'success', text: message })}
            onPackCreated={(pack) => {
              queryClient.setQueryData<Pack[]>(queryKeys.packs.list, (current = []) => [pack, ...current]);
              openPack(pack.id);
              setNotice({ tone: 'success', text: 'Pack created' });
            }}
            onTeamCreated={async (team) => {
              queryClient.setQueryData<Team[]>(queryKeys.teams.all, (current = []) =>
                [team, ...current].sort((left, right) => left.name.localeCompare(right.name)),
              );
              setNotice({ tone: 'success', text: 'Team created' });
            }}
          />
        ) : null
      }
      sidebar={
        <WorkspaceNav
          activeView={sidebarView}
          isAdmin={Boolean(user?.isAdmin)}
          packCount={packs.length}
          selectedPack={selectedPackSummary}
          onOpenAccount={() => void navigate({ to: '/app/settings/account' })}
          onOpenAdmin={() => void navigate({ to: '/app/settings/admin' })}
          onOpenPack={() => {
            if (selectedPackId) openPack(selectedPackId);
          }}
          onOpenPacks={openPacksView}
        />
      }
      toolsTrigger={
        <Button
          aria-controls="workspace-tools"
          aria-expanded={showMobileTools}
          className="workspace-tools-trigger"
          onClick={() => setShowMobileTools((visible) => !visible)}
          variant="secondary"
        >
          <Plus size={17} />
          Create or join
        </Button>
      }
    >
      {notice ? <NoticeBar notice={notice} onClose={() => setNotice(null)} /> : null}
      {route.kind === 'settings' && route.section === 'admin' ? (
        <AdminSettingsPage
          api={api}
          isAdmin={Boolean(user?.isAdmin)}
          instanceSettings={instanceSettings}
          onClose={() => {
            void navigate({ to: '/app/packs', search: { q: undefined, visibility: undefined, sort: undefined } });
          }}
          onChanged={(message, settings) => {
            if (settings) queryClient.setQueryData(queryKeys.instance, settings);
            setNotice({ tone: 'success', text: message });
          }}
          onError={reportError}
        />
      ) : route.kind === 'settings' ? (
        <AccountSettingsPage
          api={api}
          onClose={() => {
            void navigate({ to: '/app/packs', search: { q: undefined, visibility: undefined, sort: undefined } });
          }}
          onChanged={(message) => setNotice({ tone: 'success', text: message })}
          onError={reportError}
        />
      ) : workspaceView === 'packs' ? (
        <PackLibrary
          api={api}
          packs={packs}
          selectedPackId={selectedPackId}
          loading={loading}
          filters={route.kind === 'workspace' ? route.filters : undefined}
          onSelect={openPack}
        />
      ) : selectedPack ? (
        <PackDetail
          api={api}
          backgroundRemovalStatus={backgroundRemovalStatus}
          pack={selectedPack}
          packs={packs}
          initialTab={route.kind === 'workspace' ? (route.section ?? 'overview') : 'overview'}
          onSectionChange={(section) => {
            if (section === 'overview') {
              void navigate({ to: '/app/packs/$packId', params: { packId: selectedPack.id } });
            } else if (section === 'stickers') {
              void navigate({ to: '/app/packs/$packId/stickers', params: { packId: selectedPack.id } });
            } else if (section === 'collaboration') {
              void navigate({ to: '/app/packs/$packId/collaboration', params: { packId: selectedPack.id } });
            } else if (section === 'activity') {
              void navigate({ to: '/app/packs/$packId/activity', params: { packId: selectedPack.id } });
            } else if (section === 'settings') {
              void navigate({ to: '/app/packs/$packId/settings', params: { packId: selectedPack.id } });
            }
          }}
          onChanged={async (message) => {
            await invalidateWorkspace();
            setNotice({ tone: 'success', text: message });
          }}
          onDeleted={() => {
            queryClient.setQueryData<Pack[]>(queryKeys.packs.list, (current = []) =>
              current.filter((pack) => pack.id !== selectedPack.id),
            );
            queryClient.removeQueries({ queryKey: queryKeys.packs.detail(selectedPack.id) });
            void navigate({ to: '/app/packs', search: { q: undefined, visibility: undefined, sort: undefined } });
            setNotice({ tone: 'success', text: 'Pack deleted' });
          }}
          onCloned={(pack) => {
            queryClient.setQueryData<Pack[]>(queryKeys.packs.list, (current = []) => [pack, ...current]);
            openPack(pack.id);
            setNotice({ tone: 'success', text: 'Pack cloned' });
          }}
          onError={reportError}
          onNotice={(message) => setNotice({ tone: 'success', text: message })}
        />
      ) : (
        <EmptyStateComponent
          description="Create or select a pack."
          icon={<ImagePlus size={34} />}
          title="No pack selected"
        />
      )}
    </AppShell>
  );
}

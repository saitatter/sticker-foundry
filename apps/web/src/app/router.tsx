import { createRootRoute, createRoute, createRouter, Link, Outlet, redirect, useParams, useSearch } from '@tanstack/react-router';
import { App } from '../App';

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/login' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <App route={{ kind: 'login' }} />,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPasswordRoute,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  beforeLoad: () => {
    throw redirect({ to: '/app/packs', search: { q: undefined, visibility: undefined, sort: undefined } });
  },
});

const packsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/packs',
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    visibility: isPackFilter(search.visibility) ? search.visibility : undefined,
    sort: isPackSort(search.sort) ? search.sort : undefined,
  }),
  component: PacksRoute,
});

const packRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/packs/$packId',
  component: PackRoute,
});

const stickersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/packs/$packId/stickers',
  component: () => <PackSectionRoute section="stickers" />,
});

const collaborationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/packs/$packId/collaboration',
  component: () => <PackSectionRoute section="collaboration" />,
});

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/packs/$packId/activity',
  component: () => <PackSectionRoute section="activity" />,
});

const packSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/packs/$packId/settings',
  component: () => <PackSectionRoute section="settings" />,
});

const shareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share/$packId',
  component: ShareRoute,
});

const accountSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings/account',
  component: () => <SettingsRoute section="account" />,
});

const securitySettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings/security',
  component: () => <SettingsRoute section="security" />,
});

const instanceSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings/instance',
  component: () => <SettingsRoute section="instance" />,
});

const processingSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings/processing',
  component: () => <SettingsRoute section="processing" />,
});

const auditSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/settings/audit',
  component: () => <SettingsRoute section="audit" />,
});

const teamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/teams/$teamId',
  component: TeamRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  resetPasswordRoute,
  appRoute,
  packsRoute,
  packRoute,
  stickersRoute,
  collaborationRoute,
  activityRoute,
  packSettingsRoute,
  shareRoute,
  accountSettingsRoute,
  securitySettingsRoute,
  instanceSettingsRoute,
  processingSettingsRoute,
  auditSettingsRoute,
  teamRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function RootLayout() {
  return <Outlet />;
}

function PackRoute() {
  const { packId } = useParams({ from: '/app/packs/$packId' });
  return <App route={{ kind: 'workspace', view: 'pack', packId, section: 'overview' }} />;
}

function PackSectionRoute({ section }: { section: 'stickers' | 'collaboration' | 'activity' | 'settings' }) {
  const { packId } = useParams({ strict: false });
  return <App route={{ kind: 'workspace', view: 'pack', packId, section }} />;
}

function PacksRoute() {
  const search = useSearch({ from: '/app/packs' });
  return <App route={{ kind: 'workspace', view: 'packs', filters: search }} />;
}

function ShareRoute() {
  const { packId } = useParams({ from: '/share/$packId' });
  return <App route={{ kind: 'share', packId }} />;
}

function SettingsRoute({ section }: { section: 'account' | 'security' | 'instance' | 'processing' | 'audit' }) {
  return <App route={{ kind: 'settings', section }} />;
}

function TeamRoute() {
  const { teamId } = useParams({ from: '/app/teams/$teamId' });
  return <App route={{ kind: 'team', teamId }} />;
}

function ResetPasswordRoute() {
  const { token } = useSearch({ from: '/reset-password' });
  return <App route={{ kind: 'reset', token: token ?? null }} />;
}

function NotFound() {
  return (
    <main className="empty-state">
      <h1>Page not found</h1>
      <p>The requested Sticker Foundry page does not exist.</p>
      <Link className="primary-button" search={{ q: undefined, visibility: undefined, sort: undefined }} to="/app/packs">
        Open packs
      </Link>
    </main>
  );
}

function isPackFilter(value: unknown): value is 'all' | 'public' | 'private' | 'ready' | 'needs-work' {
  return value === 'all' || value === 'public' || value === 'private' || value === 'ready' || value === 'needs-work';
}

function isPackSort(value: unknown): value is 'updated' | 'name' | 'stickers' {
  return value === 'updated' || value === 'name' || value === 'stickers';
}

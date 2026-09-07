import { AlertCircle, Archive, CheckCircle2, Film, Globe2, Lock, Search } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Pack, StickerFoundryApi } from './api';
import { queryKeys } from './lib/query-keys';
import { PageHeader } from './components/layout/page-header';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Metric } from './components/ui/metric';
import { Select } from './components/ui/select';
import { StatusPill } from './components/ui/status-pill';

export type PackFilter = 'all' | 'public' | 'private' | 'ready' | 'needs-work';
export type PackSort = 'updated' | 'name' | 'stickers';

export function PackLibrary({
  api,
  packs,
  selectedPackId,
  loading,
  filters,
  onSelect,
}: {
  api: StickerFoundryApi;
  packs: Pack[];
  selectedPackId: string | null;
  loading: boolean;
  filters?: { q?: string; visibility?: PackFilter; sort?: PackSort };
  onSelect: (packId: string) => void;
}) {
  const navigate = useNavigate();
  const query = filters?.q ?? '';
  const [searchValue, setSearchValue] = useState(query);
  const filter = filters?.visibility ?? 'all';
  const sort = filters?.sort ?? 'updated';
  const hasSearch = query.trim().length > 0;
  const readyCount = packs.filter((pack) => pack.stickerCount >= 3).length;
  const publicCount = packs.filter((pack) => pack.isPublic).length;
  const privateCount = packs.length - publicCount;

  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    const nextQuery = searchValue.trim();
    if (nextQuery === query.trim()) return undefined;

    const timeoutId = window.setTimeout(() => {
      void updateSearch(navigate, { q: nextQuery || undefined });
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [navigate, query, searchValue]);

  const visiblePacks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return packs
      .filter((pack) => {
        if (normalizedQuery) {
          const haystack = `${pack.name} ${pack.publisher} ${pack.description ?? ''}`.toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        if (filter === 'public') return pack.isPublic;
        if (filter === 'private') return !pack.isPublic;
        if (filter === 'ready') return pack.stickerCount >= 3;
        if (filter === 'needs-work') return pack.stickerCount < 3;
        return true;
      })
      .sort((left, right) => {
        if (sort === 'name') return left.name.localeCompare(right.name);
        if (sort === 'stickers') return right.stickerCount - left.stickerCount || left.name.localeCompare(right.name);
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [filter, packs, query, sort]);

  return (
    <section className="pack-library" aria-label="Sticker packs">
      <PageHeader
        actions={<span className="counter">{loading ? '...' : visiblePacks.length}</span>}
        className="pack-library-header"
        eyebrow="Library"
        title="Packs"
      />
      <div className="pack-library-metrics">
        <Metric label="Total" value={String(packs.length)} />
        <Metric label="Ready" value={String(readyCount)} />
        <Metric label="Public" value={String(publicCount)} />
        <Metric label="Private" value={String(privateCount)} />
      </div>
      <div className="pack-library-toolbar">
        <div className="search-field">
          <Search size={15} />
          <Input
            aria-label="Search packs"
            placeholder="Search packs"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
        </div>
        <div className="pack-library-selects">
          <Select
            aria-label="Filter packs"
            value={filter}
            onChange={(event) => void updateSearch(navigate, { visibility: event.target.value as PackFilter })}
          >
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
            <option value="ready">Ready</option>
            <option value="needs-work">Needs work</option>
          </Select>
          <Select
            aria-label="Sort packs"
            value={sort}
            onChange={(event) => void updateSearch(navigate, { sort: event.target.value as PackSort })}
          >
            <option value="updated">Updated</option>
            <option value="name">Name</option>
            <option value="stickers">Stickers</option>
          </Select>
        </div>
      </div>
      <div className="pack-album-grid">
        {visiblePacks.length === 0 && !loading ? (
          <div className="empty-pack-list">
            <Archive size={22} />
            <span>{packs.length === 0 ? 'No packs' : 'No packs match the current filters'}</span>
          </div>
        ) : null}
        {visiblePacks.map((pack) => (
          <Button
            aria-label={`Open pack ${pack.name}`}
            className={`pack-album-card ${pack.id === selectedPackId ? 'selected' : ''} ${hasSearch ? 'search-match' : ''}`}
            key={pack.id}
            onClick={() => onSelect(pack.id)}
            type="button"
            variant="unstyled"
          >
            <PackCover api={api} pack={pack} />
            <span className="pack-album-copy">
              <strong>{pack.name}</strong>
              <small>{pack.publisher}</small>
              {pack.description ? <span>{pack.description}</span> : pack.teamName ? <span>{pack.teamName}</span> : null}
            </span>
            <span className="pack-album-meta">
              <StatusPill className={pack.isPublic ? 'public' : 'private'}>
                {pack.isPublic ? <Globe2 size={13} /> : <Lock size={13} />}
                {pack.isPublic ? 'Public' : 'Private'}
              </StatusPill>
              <StatusPill className={pack.stickerCount >= 3 ? 'ready' : 'needs-work'}>
                {pack.stickerCount >= 3 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                {pack.stickerCount}/30
              </StatusPill>
              {pack.isAnimated ? (
                <StatusPill className="pending">
                  <Film size={13} />
                  Animated
                </StatusPill>
              ) : null}
              {pack.role ? <StatusPill>{roleLabel(pack.role)}</StatusPill> : null}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

function PackCover({ api, pack }: { api: StickerFoundryApi; pack: Pack }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const coverQuery = useQuery({
    queryKey: queryKeys.packs.cover(pack.id, pack.imageDataVersion),
    queryFn: () => api.coverBlob(pack.id),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!coverQuery.data) {
      setCoverUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(coverQuery.data);
    setCoverUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [coverQuery.data]);

  const loadingCover = coverQuery.isPending;

  return (
    <span className={`pack-cover ${coverUrl ? 'has-image' : ''} ${loadingCover ? 'loading' : ''}`}>
      {loadingCover ? (
        <span className="pack-cover-skeleton" />
      ) : coverUrl ? (
        <img alt="" src={coverUrl} />
      ) : (
        <span className="pack-cover-initials">{packInitials(pack.name)}</span>
      )}
      <span className={`pack-cover-privacy ${pack.isPublic ? 'public' : 'private'}`}>
        {pack.isPublic ? <Globe2 size={14} /> : <Lock size={14} />}
      </span>
    </span>
  );
}

function packInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return initials || 'SF';
}

function roleLabel(role?: Pack['role']) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'VIEWER') return 'Viewer';
  return 'Private';
}

function updateSearch(
  navigate: ReturnType<typeof useNavigate>,
  next: { q?: string; visibility?: PackFilter; sort?: PackSort },
) {
  return navigate({
    to: '/app/packs',
    search: (current) => ({
      q: 'q' in next ? next.q : current.q,
      visibility: 'visibility' in next ? next.visibility : current.visibility,
      sort: 'sort' in next ? next.sort : current.sort,
    }),
  });
}

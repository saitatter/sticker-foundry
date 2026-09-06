export const queryKeys = {
  instance: ['instance'] as const,
  me: ['me'] as const,
  packs: {
    all: ['packs'] as const,
    list: ['packs', 'list'] as const,
    detail: (packId: string) => ['packs', 'detail', packId] as const,
    cover: (packId: string, version: string) => ['packs', 'cover', packId, version] as const,
    members: (packId: string) => ['packs', packId, 'members'] as const,
    invites: (packId: string) => ['packs', packId, 'invites'] as const,
    activity: (packId: string) => ['packs', packId, 'activity'] as const,
  },
  teams: {
    all: ['teams'] as const,
    members: (teamId: string) => ['teams', teamId, 'members'] as const,
  },
  jobs: {
    detail: (jobId: string) => ['jobs', jobId] as const,
  },
  admin: {
    settings: ['admin', 'settings'] as const,
    audit: (limit: number) => ['admin', 'audit', limit] as const,
  },
} as const;

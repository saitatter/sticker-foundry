export const QUEUE_NAMES = {
  media: 'media',
  export: 'export',
  email: 'email',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES = Object.values(QUEUE_NAMES) as QueueName[];
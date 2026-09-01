import type {
  AuditLogEntryDto,
  AuthResponseDto,
  JobResponseDto,
  PackDto,
  PackRole as SharedPackRole,
  StickerDto,
  StickerReviewStatus as SharedStickerReviewStatus,
} from '@sticker-foundry/shared-types';

export type User = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
};

export type AuthResponse = AuthResponseDto;

export type JobStatus = JobResponseDto['status'];

export type JobResponse = JobResponseDto;

export type UserSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};

export type RegistrationMode = 'open' | 'invite-only' | 'disabled';

export type AdminSettings = {
  registrationMode: RegistrationMode;
  registrationInviteCode: string;
  storageQuotaBytes: number | null;
  auditRetentionDays: number | null;
  backgroundRemoval: {
    thresholdAvailable: boolean;
    aiCommandConfigured: boolean;
    aiMode: 'command' | null;
    fallbackMode: 'threshold';
  };
  instanceName: string;
  instanceDescription: string;
};

export type InstanceSettings = {
  instanceName: string;
  instanceDescription: string;
};

export type AuditLogEntry = AuditLogEntryDto;

export type UpdateAdminSettingsInput = {
  registrationMode?: RegistrationMode;
  registrationInviteCode?: string | null;
  storageQuotaBytes?: number | null;
  auditRetentionDays?: number | null;
  instanceName?: string;
  instanceDescription?: string;
};

export type Sticker = StickerDto;

export type StickerComment = {
  id: string;
  stickerId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  user: User;
};

export type PackRole = SharedPackRole;
export type StickerReviewStatus = SharedStickerReviewStatus;

export type AnimatedStickerOptions = {
  animatedTrimStart?: number;
  animatedTrimEnd?: number;
  animatedFrameRate?: number;
  animatedQuality?: number;
};

export type BackgroundRemovalUploadOptions = {
  backgroundRemovalMode?: 'none' | 'threshold' | 'ai';
  backgroundRemovalThreshold?: number;
  backgroundRemovalFeather?: number;
  backgroundRemovalCleanupSpeckles?: boolean;
  backgroundRemovalSpeckleSize?: number;
};

export type StickerUploadOptions = AnimatedStickerOptions & BackgroundRemovalUploadOptions;

export type Pack = PackDto;

export type PackMember = {
  id: string;
  role: PackRole;
  createdAt: string;
  user: User;
};

export type PackInvite = {
  id: string;
  packId: string;
  code: string;
  email?: string | null;
  role: PackRole;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  createdAt: string;
  createdBy?: User;
  acceptedBy?: User | null;
};

export type Team = {
  id: string;
  name: string;
  description?: string | null;
  role?: PackRole;
  memberCount: number;
  packCount: number;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  role: PackRole;
  user: User;
};

export type ExportContents = {
  sticker_packs: Array<{
    identifier: string;
    name: string;
    publisher: string;
    tray_image_file: string;
    image_data_version: string;
    animated_sticker_pack: boolean;
    stickers: Array<{
      image_file: string;
      emojis: string[];
      accessibility_text?: string;
    }>;
  }>;
};

export type CreatePackInput = {
  name: string;
  publisher: string;
  description?: string;
  isPublic: boolean;
  requiresApproval?: boolean;
  isAnimated?: boolean;
  teamId?: string;
};

export type UpdatePackInput = Partial<CreatePackInput>;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function readError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

function appendStickerUploadOptions(form: FormData, options?: StickerUploadOptions) {
  if (!options) return;
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
}

export class StickerFoundryApi {
  private refreshPromise: Promise<string | null> | null = null;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuth: (auth: AuthResponse | null) => void = () => undefined,
  ) {}

  async register(email: string, displayName: string, password: string, inviteCode?: string) {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      headers: { 'X-Refresh-Cookie': 'true' },
      body: JSON.stringify({ email, displayName, password, inviteCode: inviteCode || undefined }),
    });
  }

  async login(email: string, password: string) {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: { 'X-Refresh-Cookie': 'true' },
      body: JSON.stringify({ email, password }),
    });
  }

  async me() {
    return this.request<User>('/auth/me', { auth: true });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ changed: boolean }>('/auth/password', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async requestPasswordReset(email: string) {
    return this.request<{ accepted: boolean }>('/auth/password/reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token: string, newPassword: string) {
    return this.request<{ changed: boolean }>('/auth/password/reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  async logout() {
    return this.request<{ revoked: boolean }>('/auth/logout', {
      method: 'POST',
      headers: { 'X-Refresh-Cookie': 'true' },
    });
  }

  async sessions() {
    return this.request<UserSession[]>('/auth/sessions', { auth: true });
  }

  async revokeSession(id: string) {
    return this.request<{ revoked: boolean }>(`/auth/sessions/${id}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async revokeAllSessions() {
    return this.request<{ revoked: boolean }>('/auth/sessions', {
      method: 'DELETE',
      auth: true,
    });
  }

  async instanceSettings() {
    return this.request<InstanceSettings>('/instance');
  }

  async adminSettings() {
    return this.request<AdminSettings>('/admin/settings', { auth: true });
  }

  async updateAdminSettings(input: UpdateAdminSettingsInput) {
    return this.request<AdminSettings>('/admin/settings', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    });
  }

  async adminAuditLog(limit = 25) {
    return this.request<AuditLogEntry[]>(`/admin/audit-log?limit=${limit}`, { auth: true });
  }

  async exportAuditLog(limit = 1000) {
    const response = await fetch(`${API_BASE_URL}/admin/audit-log/export?limit=${limit}`, {
      headers: new Headers(this.authHeaders()),
      credentials: 'include',
    });
    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }
    return response.blob();
  }

  async cleanupAuditLog() {
    return this.request<{ deleted: number; cutoff: string | null }>('/admin/audit-log/cleanup', {
      method: 'POST',
      auth: true,
    });
  }

  async packs() {
    return this.request<Pack[]>('/packs', { auth: true });
  }

  async publicPacks() {
    return this.request<Pack[]>('/public/packs');
  }

  async publicPack(id: string) {
    return this.request<Pack>(`/public/packs/${id}`);
  }

  async publicExportPack(packId: string) {
    const response = await fetch(`${API_BASE_URL}/public/packs/${packId}/export`);
    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }
    return response.blob();
  }

  async teams() {
    return this.request<Team[]>('/teams', { auth: true });
  }

  async createTeam(name: string, description?: string) {
    return this.request<Team>('/teams', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ name, description }),
    });
  }

  async teamMembers(id: string) {
    return this.request<TeamMember[]>(`/teams/${id}/members`, { auth: true });
  }

  async addTeamMember(id: string, email: string, role: Exclude<PackRole, 'OWNER'>) {
    return this.request<TeamMember>(`/teams/${id}/members`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ email, role }),
    });
  }

  async updateTeamMember(teamId: string, memberId: string, role: Exclude<PackRole, 'OWNER'>) {
    return this.request<TeamMember>(`/teams/${teamId}/members/${memberId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ role }),
    });
  }

  async removeTeamMember(teamId: string, memberId: string) {
    return this.request<{ deleted: boolean }>(`/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async pack(id: string) {
    return this.request<Pack>(`/packs/${id}`, { auth: true });
  }

  async createPack(input: CreatePackInput) {
    return this.request<Pack>('/packs', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    });
  }

  async updatePack(id: string, input: UpdatePackInput) {
    return this.request<Pack>(`/packs/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    });
  }

  async deletePack(id: string) {
    return this.request<{ deleted: boolean }>(`/packs/${id}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async clonePack(id: string) {
    return this.request<Pack>(`/packs/${id}/clone`, {
      method: 'POST',
      auth: true,
    });
  }

  async packMembers(id: string) {
    return this.request<PackMember[]>(`/packs/${id}/members`, { auth: true });
  }

  async updatePackMember(packId: string, memberId: string, role: Exclude<PackRole, 'OWNER'>) {
    return this.request<PackMember>(`/packs/${packId}/members/${memberId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ role }),
    });
  }

  async removePackMember(packId: string, memberId: string) {
    return this.request<{ deleted: boolean }>(`/packs/${packId}/members/${memberId}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async packInvites(id: string) {
    return this.request<PackInvite[]>(`/packs/${id}/invites`, { auth: true });
  }

  async packActivity(id: string) {
    return this.request<AuditLogEntry[]>(`/packs/${id}/activity`, { auth: true });
  }

  async createPackInvite(id: string, role: Exclude<PackRole, 'OWNER'>, email?: string, expiresAt?: string) {
    return this.request<PackInvite>(`/packs/${id}/invites`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ role, email: email?.trim() || undefined, expiresAt }),
    });
  }

  async revokePackInvite(packId: string, inviteId: string) {
    return this.request<{ deleted: boolean }>(`/packs/${packId}/invites/${inviteId}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async acceptPackInvite(code: string) {
    return this.request<Pack>(`/packs/invites/${encodeURIComponent(code)}/accept`, {
      method: 'POST',
      auth: true,
    });
  }

  async uploadSticker(packId: string, file: File, emojis: string[], accessibilityText: string, uploadOptions?: StickerUploadOptions) {
    const form = new FormData();
    form.append('file', file);
    form.append('emojis', emojis.join(','));
    if (accessibilityText.trim()) {
      form.append('accessibilityText', accessibilityText.trim());
    }
    appendStickerUploadOptions(form, uploadOptions);

    return this.request<Sticker>(`/packs/${packId}/stickers`, {
      method: 'POST',
      auth: true,
      body: form,
      isMultipart: true,
    });
  }

  async queueStickerUpload(
    packId: string,
    file: File,
    emojis: string[],
    accessibilityText: string,
    uploadOptions?: StickerUploadOptions,
  ) {
    const form = new FormData();
    form.append('file', file);
    form.append('emojis', emojis.join(','));
    if (accessibilityText.trim()) {
      form.append('accessibilityText', accessibilityText.trim());
    }
    appendStickerUploadOptions(form, uploadOptions);

    return this.request<JobResponse>(`/packs/${packId}/stickers/jobs`, {
      method: 'POST',
      auth: true,
      body: form,
      isMultipart: true,
    });
  }

  async job(id: string) {
    return this.request<JobResponse>(`/jobs/${id}`, { auth: true });
  }

  async cancelJob(id: string) {
    return this.request<JobResponse>(`/jobs/${id}/cancel`, {
      method: 'POST',
      auth: true,
    });
  }

  async retryJob(id: string) {
    return this.request<JobResponse>(`/jobs/${id}/retry`, {
      method: 'POST',
      auth: true,
    });
  }

  async waitForJob(id: string, onUpdate?: (job: JobResponse) => void) {
    for (;;) {
      const job = await this.job(id);
      onUpdate?.(job);
      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        return job;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 750));
    }
  }

  async uploadTrayIcon(packId: string, file: File) {
    const form = new FormData();
    form.append('file', file);

    return this.request<Pack>(`/packs/${packId}/tray-icon`, {
      method: 'POST',
      auth: true,
      body: form,
      isMultipart: true,
    });
  }

  async trayIconBlob(packId: string) {
    const response = await fetch(`${API_BASE_URL}/packs/${packId}/tray-icon`, {
      headers: new Headers(this.authHeaders()),
      credentials: 'include',
    });
    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }
    return response.blob();
  }

  async deleteSticker(packId: string, stickerId: string) {
    return this.request<{ deleted: boolean }>(`/packs/${packId}/stickers/${stickerId}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async updateSticker(
    packId: string,
    stickerId: string,
    emojis: string[],
    accessibilityText: string,
    reviewStatus?: StickerReviewStatus,
  ) {
    return this.request<Sticker>(`/packs/${packId}/stickers/${stickerId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({
        emojis: emojis.slice(0, 3),
        accessibilityText,
        reviewStatus,
      }),
    });
  }

  async replaceStickerImage(packId: string, stickerId: string, file: File, uploadOptions?: StickerUploadOptions) {
    const form = new FormData();
    form.append('file', file);
    appendStickerUploadOptions(form, uploadOptions);

    return this.request<Sticker>(`/packs/${packId}/stickers/${stickerId}/file`, {
      method: 'PUT',
      auth: true,
      body: form,
      isMultipart: true,
    });
  }

  async stickerComments(packId: string, stickerId: string) {
    return this.request<StickerComment[]>(`/packs/${packId}/stickers/${stickerId}/comments`, { auth: true });
  }

  async createStickerComment(packId: string, stickerId: string, body: string) {
    return this.request<StickerComment>(`/packs/${packId}/stickers/${stickerId}/comments`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ body }),
    });
  }

  async deleteStickerComment(packId: string, stickerId: string, commentId: string) {
    return this.request<{ deleted: boolean }>(`/packs/${packId}/stickers/${stickerId}/comments/${commentId}`, {
      method: 'DELETE',
      auth: true,
    });
  }

  async reorderStickers(packId: string, stickerIds: string[]) {
    return this.request<Pack>(`/packs/${packId}/stickers`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ stickerIds }),
    });
  }

  async copyStickers(sourcePackId: string, targetPackId: string, stickerIds: string[]) {
    return this.request<Pack>(`/packs/${sourcePackId}/stickers/copy`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ targetPackId, stickerIds }),
    });
  }

  async moveStickers(sourcePackId: string, targetPackId: string, stickerIds: string[]) {
    return this.request<Pack>(`/packs/${sourcePackId}/stickers/move`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ targetPackId, stickerIds }),
    });
  }

  async stickerBlob(packId: string, stickerId: string) {
    const response = await fetch(`${API_BASE_URL}/packs/${packId}/stickers/${stickerId}/file`, {
      headers: new Headers(this.authHeaders()),
      credentials: 'include',
    });
    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }
    return response.blob();
  }

  async exportPack(packId: string) {
    const response = await fetch(`${API_BASE_URL}/packs/${packId}/export`, {
      headers: new Headers(this.authHeaders()),
      credentials: 'include',
    });
    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }
    return response.blob();
  }

  async queueExportPack(packId: string) {
    return this.request<JobResponse>(`/packs/${packId}/export/jobs`, {
      method: 'POST',
      auth: true,
    });
  }

  async exportContents(packId: string) {
    return this.request<ExportContents>(`/packs/${packId}/contents`, { auth: true });
  }

  private async request<T>(
    path: string,
    options: RequestInit & { auth?: boolean; isMultipart?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers(options.headers);
    if (!options.isMultipart) {
      headers.set('Content-Type', 'application/json');
    }
    if (options.auth) {
      for (const [key, value] of Object.entries(this.authHeaders())) {
        headers.set(key, value);
      }
    }

    let response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const refreshedToken = response.status === 401 && options.auth ? await this.refreshAuth() : null;
    if (refreshedToken) {
      const retryHeaders = new Headers(options.headers);
      if (!options.isMultipart) {
        retryHeaders.set('Content-Type', 'application/json');
      }
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: retryHeaders,
        credentials: 'include',
      });
    }

    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }

    return response.json() as Promise<T>;
  }

  private authHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async refreshAuth() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Refresh-Cookie': 'true' },
        credentials: 'include',
      });
      if (!response.ok) {
        this.onAuth(null);
        return null;
      }

      const auth = (await response.json()) as AuthResponse;
      this.onAuth(auth);
      return auth.accessToken;
    })();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }
}

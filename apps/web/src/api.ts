import type {
  AuditLogEntryDto,
  AuthResponseDto,
  JobResponseDto,
  PackDto,
  PackRole as SharedPackRole,
  StickerDto,
  StickerReviewStatus as SharedStickerReviewStatus,
} from '@sticker-foundry/shared-types';
import { HttpClient } from './lib/api/http';

export { ApiError } from './lib/api/http';

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

function appendStickerUploadOptions(form: FormData, options?: StickerUploadOptions) {
  if (!options) return;
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
}

export class StickerFoundryApi {
  private readonly http: HttpClient<AuthResponse>;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuth: (auth: AuthResponse | null) => void = () => undefined,
  ) {
    this.http = new HttpClient<AuthResponse>(getToken, onAuth);
  }

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

  async refreshSession() {
    return this.http.refreshResponse();
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
    return this.http.blob(`/admin/audit-log/export?limit=${limit}`, { auth: true });
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
    return this.http.blob(`/public/packs/${packId}/export`);
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

  async packActivity(id: string, limit?: number) {
    const query = limit === undefined ? '' : `?limit=${limit}`;
    return this.request<AuditLogEntry[]>(`/packs/${id}/activity${query}`, { auth: true });
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

  async uploadSticker(
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

  async trayIconBlob(packId: string, imageDataVersion?: string) {
    const version = imageDataVersion ? `?v=${encodeURIComponent(imageDataVersion)}` : '';
    return this.http.blob(`/packs/${packId}/tray-icon${version}`, { auth: true });
  }

  async coverBlob(packId: string) {
    return this.http.blob(`/packs/${packId}/cover`, { auth: true });
  }

  async publicCoverBlob(packId: string) {
    return this.http.blob(`/public/packs/${packId}/cover`);
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
    return this.http.blob(`/packs/${packId}/stickers/${stickerId}/file`, { auth: true });
  }

  async exportPack(packId: string) {
    return this.http.blob(`/packs/${packId}/export`, { auth: true });
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
    return this.http.request<T>(path, options);
  }
}

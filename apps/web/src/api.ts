export type User = {
  id: string;
  email: string;
  displayName: string;
};

export type AuthResponse = {
  accessToken: string;
  user: User;
};

export type Sticker = {
  id: string;
  fileName: string;
  emojis: string[];
  accessibilityText?: string | null;
  sizeBytes: number;
  sha256: string;
  position: number;
  createdAt: string;
};

export type Pack = {
  id: string;
  name: string;
  publisher: string;
  description?: string | null;
  isPublic: boolean;
  imageDataVersion: string;
  stickerCount: number;
  updatedAt: string;
  stickers?: Sticker[];
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

export class StickerFoundryApi {
  constructor(private readonly getToken: () => string | null) {}

  async register(email: string, displayName: string, password: string) {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, displayName, password }),
    });
  }

  async login(email: string, password: string) {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async me() {
    return this.request<User>('/auth/me', { auth: true });
  }

  async packs() {
    return this.request<Pack[]>('/packs', { auth: true });
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

  async uploadSticker(packId: string, file: File, emojis: string[], accessibilityText: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('emojis', emojis.join(','));
    if (accessibilityText.trim()) {
      form.append('accessibilityText', accessibilityText.trim());
    }

    return this.request<Sticker>(`/packs/${packId}/stickers`, {
      method: 'POST',
      auth: true,
      body: form,
      isMultipart: true,
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

  async trayIconBlob(packId: string) {
    const response = await fetch(`${API_BASE_URL}/packs/${packId}/tray-icon`, {
      headers: new Headers(this.authHeaders()),
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

  async updateSticker(packId: string, stickerId: string, emojis: string[], accessibilityText: string) {
    return this.request<Sticker>(`/packs/${packId}/stickers/${stickerId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({
        emojis: emojis.slice(0, 3),
        accessibilityText,
      }),
    });
  }

  async reorderStickers(packId: string, stickerIds: string[]) {
    return this.request<Pack>(`/packs/${packId}/stickers`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ stickerIds }),
    });
  }

  async stickerBlob(packId: string, stickerId: string) {
    const response = await fetch(`${API_BASE_URL}/packs/${packId}/stickers/${stickerId}/file`, {
      headers: new Headers(this.authHeaders()),
    });
    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }
    return response.blob();
  }

  async exportPack(packId: string) {
    const response = await fetch(`${API_BASE_URL}/packs/${packId}/export`, {
      headers: new Headers(this.authHeaders()),
    });
    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }
    return response.blob();
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

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new ApiError(await readError(response), response.status);
    }

    return response.json() as Promise<T>;
  }

  private authHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

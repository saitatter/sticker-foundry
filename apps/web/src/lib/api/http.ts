const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = RequestInit & {
  auth?: boolean;
  isMultipart?: boolean;
};

export class HttpClient<TAuth = unknown> {
  private refreshPromise: Promise<string | null> | null = null;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuth: (auth: TAuth | null) => void = () => undefined,
  ) {}

  get<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body === undefined ? options.body : JSON.stringify(body),
    });
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}) {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body === undefined ? options.body : JSON.stringify(body),
    });
  }

  delete<T>(path: string, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  multipart<T>(path: string, body: FormData, options: RequestOptions = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body, isMultipart: true });
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = this.headers(options);
    let response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const refreshedToken = response.status === 401 && options.auth ? await this.refreshAuth() : null;
    if (refreshedToken) {
      const retryHeaders = this.headers(options, refreshedToken);
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: retryHeaders,
        credentials: 'include',
      });
    }

    if (!response.ok) {
      throw await this.errorFromResponse(response);
    }

    return response.json() as Promise<T>;
  }

  async blob(path: string, options: RequestOptions = {}) {
    const headers = this.headers(options);
    let response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const refreshedToken = response.status === 401 && options.auth ? await this.refreshAuth() : null;
    if (refreshedToken) {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: this.headers(options, refreshedToken),
        credentials: 'include',
      });
    }

    if (!response.ok) {
      throw await this.errorFromResponse(response);
    }
    return response.blob();
  }

  async refresh() {
    return this.refreshAuth();
  }

  async refreshResponse() {
    return this.fetchRefreshResponse();
  }

  private headers(options: RequestOptions, token = this.getToken()) {
    const headers = new Headers(options.headers);
    if (!options.isMultipart) headers.set('Content-Type', 'application/json');
    if (options.auth && token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  }

  private async errorFromResponse(response: Response) {
    const fallback = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as {
        message?: string | string[];
        code?: string;
        details?: unknown;
        requestId?: string;
      };
      const message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? fallback;
      return new ApiError(message, response.status, body.code, body.details, body.requestId);
    } catch {
      return new ApiError(fallback, response.status);
    }
  }

  private async refreshAuth() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const auth = await this.fetchRefreshResponse();
      if (!auth) {
        this.onAuth(null);
        return null;
      }
      this.onAuth(auth);
      return typeof (auth as TAuth & { accessToken?: unknown }).accessToken === 'string'
        ? (auth as TAuth & { accessToken: string }).accessToken
        : null;
    })();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async fetchRefreshResponse() {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Refresh-Cookie': 'true' },
      credentials: 'include',
    });
    if (!response.ok) return null;
    return (await response.json()) as TAuth;
  }
}

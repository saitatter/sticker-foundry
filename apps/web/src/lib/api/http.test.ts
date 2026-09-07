import { describe, expect, it, vi } from 'vitest';
import { ApiError, HttpClient } from './http';

describe(HttpClient, () => {
  it('refreshes once and retries an authenticated request after a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'expired' }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'fresh-token', user: { id: 'user-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const onAuth = vi.fn();
    const client = new HttpClient(() => 'expired-token', onAuth);

    await expect(client.get<{ ok: boolean }>('/private', { auth: true })).resolves.toEqual({ ok: true });
    expect(onAuth).toHaveBeenCalledWith({ accessToken: 'fresh-token', user: { id: 'user-1' } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ headers: expect.any(Headers), credentials: 'include' }),
    );
  });

  it('maps structured API failures to ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: ['Invalid input', 'Try again'], code: 'VALIDATION_ERROR' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const client = new HttpClient(() => null);

    await expect(client.get('/invalid')).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        message: 'Invalid input, Try again',
        status: 422,
        code: 'VALIDATION_ERROR',
      } satisfies Partial<ApiError>),
    );
  });

  it('deduplicates concurrent session refreshes', async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(refreshResponse);
    vi.stubGlobal('fetch', fetchMock);
    const client = new HttpClient(() => null);

    const first = client.refreshResponse();
    const second = client.refreshResponse();
    resolveRefresh?.(
      new Response(JSON.stringify({ accessToken: 'fresh-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { accessToken: 'fresh-token' },
      { accessToken: 'fresh-token' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

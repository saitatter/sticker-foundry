import { AuthController } from './auth.controller';

function createController(cookieEnabled = true) {
  const auth = {
    register: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'demo@example.com', displayName: 'Demo', isAdmin: false },
    }),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'AUTH_REFRESH_COOKIE_ENABLED') return String(cookieEnabled);
      return fallback;
    }),
  };
  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
  return { controller: new AuthController(auth as never, config as never), auth, response };
}

describe(AuthController, () => {
  it('omits the refresh token from web responses when the cookie is requested', async () => {
    const { controller, response } = createController();

    await expect(
      controller.register(
        { email: 'demo@example.com', displayName: 'Demo', password: 'password123' },
        'true',
        response as never,
      ),
    ).resolves.toEqual({
      accessToken: 'access-token',
      user: { id: 'user-1', email: 'demo@example.com', displayName: 'Demo', isAdmin: false },
    });
    expect(response.cookie).toHaveBeenCalledWith('stickerfoundry_refresh', 'refresh-token', expect.any(Object));
  });

  it('keeps the refresh token in body responses for clients without cookie opt-in', async () => {
    const { controller, response } = createController();

    await expect(
      controller.register(
        { email: 'demo@example.com', displayName: 'Demo', password: 'password123' },
        undefined,
        response as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ refreshToken: 'refresh-token' }));
  });
});
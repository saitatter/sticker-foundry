import { ArrowLeft, KeyRound } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { StickerFoundryApi, UserSession } from './api';

export function AccountSettingsPage({
  api,
  onClose,
  onChanged,
  onError,
}: {
  api: StickerFoundryApi;
  onClose: () => void;
  onChanged: (message: string) => void;
  onError: (error: unknown) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.sessions().then(setSessions).catch(onError);
  }, [api, onError]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      onChanged('Password changed');
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(id: string) {
    try {
      await api.revokeSession(id);
      setSessions((current) =>
        current.map((session) => (session.id === id ? { ...session, revokedAt: new Date().toISOString() } : session)),
      );
    } catch (error) {
      onError(error);
    }
  }

  async function revokeAllSessions() {
    try {
      await api.revokeAllSessions();
      const revokedAt = new Date().toISOString();
      setSessions((current) => current.map((session) => ({ ...session, revokedAt: session.revokedAt ?? revokedAt })));
      onChanged('All sessions revoked');
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Account settings</h2>
          <p>Manage your password and the devices currently signed in to Sticker Foundry.</p>
        </div>
        <button className="secondary-button" onClick={onClose} type="button">
          <ArrowLeft size={17} />
          Back to workspace
        </button>
      </header>

      <div className="settings-page-grid">
        <form className="settings-card form-grid" onSubmit={submit}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Security</p>
              <h3>Change password</h3>
            </div>
            <KeyRound size={20} />
          </div>
          <label>
            Current password
            <input
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              required
            />
          </label>
          <label>
            New password
            <input
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
          <div className="settings-card-actions">
            <span className="muted-row">Use at least 8 characters.</span>
            <button className="primary-button" disabled={saving} type="submit">
              <KeyRound size={17} />
              {saving ? 'Saving' : 'Change password'}
            </button>
          </div>
        </form>

        <section className="settings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sessions</p>
              <h3>Signed-in devices</h3>
            </div>
            <button className="secondary-button danger-button" onClick={() => void revokeAllSessions()} type="button">
              Revoke all
            </button>
          </div>
          <div className="session-list">
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <span>
                    <strong>{session.revokedAt ? 'Revoked' : 'Active'}</strong>
                    <small>Expires {new Date(session.expiresAt).toLocaleDateString()}</small>
                  </span>
                  <button
                    className="secondary-button danger-button"
                    disabled={Boolean(session.revokedAt)}
                    onClick={() => void revokeSession(session.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </div>
              ))
            ) : (
              <p className="muted-row">No sessions found.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

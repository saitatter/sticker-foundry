import { ArrowLeft, Download, ShieldCheck, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type {
  AdminSettings,
  AuditLogEntry,
  InstanceSettings,
  RegistrationMode,
  StickerFoundryApi,
} from './api';
import { downloadBlob } from './ui';

const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  instanceName: 'Sticker Foundry',
  instanceDescription: 'Self-hosted sticker pack management',
};

export function AdminSettingsPage({
  api,
  isAdmin,
  instanceSettings,
  onClose,
  onChanged,
  onError,
}: {
  api: StickerFoundryApi;
  isAdmin: boolean;
  instanceSettings: InstanceSettings;
  onClose: () => void;
  onChanged: (message: string, settings?: InstanceSettings) => void;
  onError: (error: unknown) => void;
}) {
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('open');
  const [registrationInviteCode, setRegistrationInviteCode] = useState('');
  const [storageQuotaMb, setStorageQuotaMb] = useState('');
  const [auditRetentionDays, setAuditRetentionDays] = useState('');
  const [instanceName, setInstanceName] = useState(instanceSettings.instanceName);
  const [instanceDescription, setInstanceDescription] = useState(instanceSettings.instanceDescription);
  const [saving, setSaving] = useState(false);
  const [exportingAudit, setExportingAudit] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;

    api
      .adminSettings()
      .then((settings) => {
        setAdminSettings(settings);
        setRegistrationMode(settings.registrationMode);
        setRegistrationInviteCode(settings.registrationInviteCode ?? '');
        setStorageQuotaMb(
          settings.storageQuotaBytes ? String(Math.round(settings.storageQuotaBytes / 1024 / 1024)) : '',
        );
        setAuditRetentionDays(settings.auditRetentionDays ? String(settings.auditRetentionDays) : '');
        setInstanceName(settings.instanceName);
        setInstanceDescription(settings.instanceDescription);
      })
      .catch(onError);

    api.adminAuditLog().then(setAuditLog).catch(onError);
  }, [api, isAdmin, onError]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const trimmedQuota = storageQuotaMb.trim();
    const quotaNumber = trimmedQuota ? Number(trimmedQuota) : null;
    const trimmedAuditRetention = auditRetentionDays.trim();
    const auditRetentionNumber = trimmedAuditRetention ? Number(trimmedAuditRetention) : null;

    if (quotaNumber !== null && (!Number.isFinite(quotaNumber) || quotaNumber <= 0)) {
      onError(new Error('Storage quota must be a positive number of MB'));
      return;
    }
    if (auditRetentionNumber !== null && (!Number.isFinite(auditRetentionNumber) || auditRetentionNumber <= 0)) {
      onError(new Error('Audit retention must be a positive number of days'));
      return;
    }

    setSaving(true);
    try {
      const settings = await api.updateAdminSettings({
        registrationMode,
        registrationInviteCode: registrationInviteCode.trim() || null,
        storageQuotaBytes: quotaNumber === null ? null : Math.round(quotaNumber * 1024 * 1024),
        auditRetentionDays: auditRetentionNumber === null ? null : Math.round(auditRetentionNumber),
        instanceName: instanceName.trim() || DEFAULT_INSTANCE_SETTINGS.instanceName,
        instanceDescription: instanceDescription.trim() || DEFAULT_INSTANCE_SETTINGS.instanceDescription,
      });
      setAdminSettings(settings);
      setRegistrationMode(settings.registrationMode);
      setRegistrationInviteCode(settings.registrationInviteCode ?? '');
      setStorageQuotaMb(settings.storageQuotaBytes ? String(Math.round(settings.storageQuotaBytes / 1024 / 1024)) : '');
      setAuditRetentionDays(settings.auditRetentionDays ? String(settings.auditRetentionDays) : '');
      setInstanceName(settings.instanceName);
      setInstanceDescription(settings.instanceDescription);
      setAuditLog(await api.adminAuditLog());
      onChanged('Admin settings saved', {
        instanceName: settings.instanceName,
        instanceDescription: settings.instanceDescription,
      });
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function exportAuditLog() {
    setExportingAudit(true);
    try {
      const blob = await api.exportAuditLog();
      downloadBlob(blob, `stickerfoundry-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      onError(error);
    } finally {
      setExportingAudit(false);
    }
  }

  async function cleanupAuditLog() {
    try {
      const result = await api.cleanupAuditLog();
      setAuditLog(await api.adminAuditLog());
      onChanged(`Audit cleanup deleted ${result.deleted} entr${result.deleted === 1 ? 'y' : 'ies'}`);
    } catch (error) {
      onError(error);
    }
  }

  if (!isAdmin) {
    return (
      <section className="settings-page empty-state">
        <ShieldCheck size={34} />
        <h2>Admin access required</h2>
        <p>This page is available only to instance administrators.</p>
        <button className="secondary-button" onClick={onClose} type="button">
          <ArrowLeft size={17} />
          Back to workspace
        </button>
      </section>
    );
  }

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Admin settings</h2>
          <p>Configure the instance and review its audit history in one readable workspace.</p>
        </div>
        <button className="secondary-button" onClick={onClose} type="button">
          <ArrowLeft size={17} />
          Back to workspace
        </button>
      </header>

      <div className="settings-page-grid">
        <form className="settings-card form-grid" onSubmit={saveSettings}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Configuration</p>
              <h3>Instance settings</h3>
            </div>
            <ShieldCheck size={20} />
          </div>

          {adminSettings ? (
            <div className="admin-status-row">
              <span>
                <strong>Background removal</strong>
                <small>
                  Threshold ready ·{' '}
                  {adminSettings.backgroundRemoval.aiCommandConfigured ? 'AI command configured' : 'AI fallback only'}
                </small>
              </span>
              <span
                className={adminSettings.backgroundRemoval.aiCommandConfigured ? 'status-pill ready' : 'status-pill warning'}
              >
                {adminSettings.backgroundRemoval.aiCommandConfigured ? 'AI ready' : 'Threshold fallback'}
              </span>
            </div>
          ) : (
            <p className="muted-row">Loading instance settings…</p>
          )}

          <div className="settings-form-grid">
            <label>
              Instance name
              <input maxLength={80} value={instanceName} onChange={(event) => setInstanceName(event.target.value)} />
            </label>
            <label>
              Instance description
              <input
                maxLength={160}
                value={instanceDescription}
                onChange={(event) => setInstanceDescription(event.target.value)}
              />
            </label>
            <label>
              Registration
              <select value={registrationMode} onChange={(event) => setRegistrationMode(event.target.value as RegistrationMode)}>
                <option value="open">Open</option>
                <option value="invite-only">Invite only</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label>
              Invite code
              <input
                disabled={registrationMode !== 'invite-only'}
                value={registrationInviteCode}
                onChange={(event) => setRegistrationInviteCode(event.target.value)}
              />
            </label>
            <label>
              Storage quota per owner (MB)
              <input
                min="1"
                placeholder="Unlimited"
                type="number"
                value={storageQuotaMb}
                onChange={(event) => setStorageQuotaMb(event.target.value)}
              />
            </label>
            <label>
              Audit retention (days)
              <input
                min="1"
                placeholder="Keep forever"
                type="number"
                value={auditRetentionDays}
                onChange={(event) => setAuditRetentionDays(event.target.value)}
              />
            </label>
          </div>

          <div className="settings-card-actions">
            <span className="muted-row">Changes apply to the whole Sticker Foundry instance.</span>
            <button className="primary-button" disabled={saving || !adminSettings} type="submit">
              <ShieldCheck size={17} />
              {saving ? 'Saving' : 'Save settings'}
            </button>
          </div>
        </form>

        <section className="settings-card settings-info-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Overview</p>
              <h3>Administrator controls</h3>
            </div>
            <ShieldCheck size={20} />
          </div>
          <p>Use invite-only registration when this instance is shared outside your local network.</p>
          <ul className="settings-list">
            <li><strong>Instance identity</strong><span>Name and description shown to users.</span></li>
            <li><strong>Registration</strong><span>Control how new accounts are created.</span></li>
            <li><strong>Storage</strong><span>Limit storage per owner or leave it unlimited.</span></li>
            <li><strong>Audit retention</strong><span>Keep audit history forever or prune it by age.</span></li>
          </ul>
        </section>
      </div>

      <section className="settings-card audit-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Security</p>
            <h3>Audit log</h3>
          </div>
          <div className="settings-card-actions compact-actions">
            <button className="secondary-button" disabled={exportingAudit} onClick={() => void exportAuditLog()} type="button">
              <Download size={17} />
              {exportingAudit ? 'Exporting' : 'Export CSV'}
            </button>
            <button className="secondary-button danger-button" onClick={() => void cleanupAuditLog()} type="button">
              <Trash2 size={17} />
              Cleanup
            </button>
          </div>
        </div>
        <div className="audit-list">
          {auditLog.length > 0 ? (
            auditLog.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <span>
                  <strong>{auditActionLabel(entry.action)}</strong>
                  <small>
                    {entry.actor?.email ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}
                  </small>
                </span>
                <small>{entry.entityType}</small>
              </div>
            ))
          ) : (
            <p className="muted-row">No audit events yet.</p>
          )}
        </div>
      </section>
    </section>
  );
}

function auditActionLabel(action: string) {
  return action
    .split('.')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

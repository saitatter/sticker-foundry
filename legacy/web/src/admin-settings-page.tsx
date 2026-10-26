import { ArrowLeft, ChevronLeft, ChevronRight, Download, ShieldCheck, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type {
  AdminSettings,
  AuditLogEntry,
  InstanceSettings,
  RegistrationMode,
  StickerFoundryApi,
} from './api';
import { downloadBlob } from './lib/download';
import { PageHeader } from './components/layout/page-header';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Select } from './components/ui/select';

const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  instanceName: 'Sticker Foundry',
  instanceDescription: 'Self-hosted sticker pack management',
};
const auditPageSizes = [10, 25, 100] as const;
const AUDIT_LOG_FETCH_LIMIT = 200;
type AuditPageSize = (typeof auditPageSizes)[number] | 'all';
type AuditPageItem = number | 'ellipsis';

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
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState<AuditPageSize>(10);

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

    api
      .adminAuditLog(AUDIT_LOG_FETCH_LIMIT)
      .then((entries) => {
        setAuditLog(entries);
        setAuditPage(1);
      })
      .catch(onError);
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
      setAuditLog(await api.adminAuditLog(AUDIT_LOG_FETCH_LIMIT));
      setAuditPage(1);
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
      setAuditLog(await api.adminAuditLog(AUDIT_LOG_FETCH_LIMIT));
      setAuditPage(1);
      onChanged(`Audit cleanup deleted ${result.deleted} entr${result.deleted === 1 ? 'y' : 'ies'}`);
    } catch (error) {
      onError(error);
    }
  }

  const auditTotalPages = auditPageSize === 'all' ? 1 : Math.max(1, Math.ceil(auditLog.length / auditPageSize));
  const currentAuditPage = Math.min(auditPage, auditTotalPages);
  const visibleAuditLog =
    auditPageSize === 'all'
      ? auditLog
      : auditLog.slice((currentAuditPage - 1) * auditPageSize, currentAuditPage * auditPageSize);
  const auditPageItems = auditPaginationItems(currentAuditPage, auditTotalPages);
  const firstVisibleAuditEntry = auditLog.length === 0 ? 0 : auditPageSize === 'all' ? 1 : (currentAuditPage - 1) * auditPageSize + 1;
  const lastVisibleAuditEntry = auditPageSize === 'all' ? auditLog.length : Math.min(auditLog.length, currentAuditPage * auditPageSize);

  useEffect(() => {
    if (auditPage > auditTotalPages) setAuditPage(auditTotalPages);
  }, [auditPage, auditTotalPages]);

  function handleAuditPageSizeChange(value: string) {
    const parsed = Number(value);
    const nextPageSize: AuditPageSize =
      value === 'all'
        ? 'all'
        : auditPageSizes.includes(parsed as (typeof auditPageSizes)[number])
          ? (parsed as (typeof auditPageSizes)[number])
          : 10;
    setAuditPageSize(nextPageSize);
    setAuditPage(1);
  }

  if (!isAdmin) {
    return (
      <section className="settings-page empty-state">
        <ShieldCheck size={34} />
        <h2>Admin access required</h2>
        <p>This page is available only to instance administrators.</p>
        <Button className="secondary-button" onClick={onClose} type="button" variant="secondary">
          <ArrowLeft size={17} />
          Back to workspace
        </Button>
      </section>
    );
  }

  return (
    <section className="settings-page">
      <PageHeader
        actions={
          <Button className="secondary-button" onClick={onClose} type="button" variant="secondary">
            <ArrowLeft size={17} />
            Back to workspace
          </Button>
        }
        className="settings-page-header"
        description="Configure the instance and review its audit history in one readable workspace."
        eyebrow="Administration"
        title="Admin settings"
      />

      <div className="settings-page-grid">
        <Card as="form" className="settings-card form-grid" onSubmit={saveSettings}>
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
                  {adminSettings.backgroundRemoval.aiCommandConfigured ? 'rembg configured' : 'rembg fallback only'}
                </small>
              </span>
              <span
                className={adminSettings.backgroundRemoval.aiCommandConfigured ? 'status-pill ready' : 'status-pill warning'}
              >
                {adminSettings.backgroundRemoval.aiCommandConfigured ? 'rembg ready' : 'Threshold fallback'}
              </span>
            </div>
          ) : (
            <p className="muted-row">Loading instance settings…</p>
          )}

          <div className="settings-form-grid">
            <Field label="Instance name" htmlFor="instance-name">
              <Input id="instance-name" maxLength={80} value={instanceName} onChange={(event) => setInstanceName(event.target.value)} />
            </Field>
            <Field label="Instance description" htmlFor="instance-description">
              <Input
                id="instance-description"
                maxLength={160}
                value={instanceDescription}
                onChange={(event) => setInstanceDescription(event.target.value)}
              />
            </Field>
            <Field label="Registration" htmlFor="registration-mode">
              <Select id="registration-mode" value={registrationMode} onChange={(event) => setRegistrationMode(event.target.value as RegistrationMode)}>
                <option value="open">Open</option>
                <option value="invite-only">Invite only</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>
            <Field label="Invite code" htmlFor="registration-invite-code">
              <Input
                id="registration-invite-code"
                disabled={registrationMode !== 'invite-only'}
                value={registrationInviteCode}
                onChange={(event) => setRegistrationInviteCode(event.target.value)}
              />
            </Field>
            <Field label="Storage quota per owner (MB)" htmlFor="storage-quota">
              <Input
                id="storage-quota"
                min="1"
                placeholder="Unlimited"
                type="number"
                value={storageQuotaMb}
                onChange={(event) => setStorageQuotaMb(event.target.value)}
              />
            </Field>
            <Field label="Audit retention (days)" htmlFor="audit-retention">
              <Input
                id="audit-retention"
                min="1"
                placeholder="Keep forever"
                type="number"
                value={auditRetentionDays}
                onChange={(event) => setAuditRetentionDays(event.target.value)}
              />
            </Field>
          </div>

          <div className="settings-card-actions">
            <span className="muted-row">Changes apply to the whole Sticker Foundry instance.</span>
            <Button className="primary-button" disabled={saving || !adminSettings} type="submit">
              <ShieldCheck size={17} />
              {saving ? 'Saving' : 'Save settings'}
            </Button>
          </div>
        </Card>

        <Card className="settings-card settings-info-card">
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
        </Card>
      </div>

      <Card className="settings-card audit-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Security</p>
            <h3>Audit log</h3>
          </div>
          <div className="settings-card-actions compact-actions">
            <Button className="secondary-button" disabled={exportingAudit} onClick={() => void exportAuditLog()} type="button" variant="secondary">
              <Download size={17} />
              {exportingAudit ? 'Exporting' : 'Export CSV'}
            </Button>
            <Button className="secondary-button danger-button" onClick={() => void cleanupAuditLog()} type="button" variant="secondary">
              <Trash2 size={17} />
              Cleanup
            </Button>
          </div>
        </div>
        <div className="audit-list">
          {auditLog.length > 0 ? (
            visibleAuditLog.map((entry) => (
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
        {auditLog.length > 0 ? (
          <div className="activity-pagination">
            <span className="activity-pagination-summary">
              Showing {firstVisibleAuditEntry}â€“{lastVisibleAuditEntry} of {auditLog.length}
            </span>
            <div className="activity-pagination-controls" aria-label="Audit pagination">
              <Button
                aria-label="Previous audit page"
                disabled={currentAuditPage === 1}
                onClick={() => setAuditPage((value) => Math.max(1, value - 1))}
                size="sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeft size={16} />
                Previous
              </Button>
              <div className="activity-page-buttons">
                {auditPageItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span className="activity-page-ellipsis" key={`ellipsis-${index}`}>
                      â€¦
                    </span>
                  ) : (
                    <button
                      aria-current={currentAuditPage === item ? 'page' : undefined}
                      aria-label={`Audit page ${item}`}
                      className={`activity-page-button${currentAuditPage === item ? ' active' : ''}`}
                      key={item}
                      onClick={() => setAuditPage(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
              <Button
                aria-label="Next audit page"
                disabled={currentAuditPage === auditTotalPages}
                onClick={() => setAuditPage((value) => Math.min(auditTotalPages, value + 1))}
                size="sm"
                type="button"
                variant="ghost"
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>
            <label className="activity-page-size">
              <span>Per page</span>
              <Select
                aria-label="Audit events per page"
                value={auditPageSize}
                onChange={(event) => handleAuditPageSizeChange(event.target.value)}
              >
                {auditPageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
                <option value="all">All</option>
              </Select>
            </label>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function auditActionLabel(action: string) {
  return action
    .split('.')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function auditPaginationItems(currentPage: number, totalPages: number): AuditPageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const items: AuditPageItem[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    if (!pages.has(pageNumber)) {
      if (items[items.length - 1] !== 'ellipsis') {
        items.push('ellipsis');
      }
      continue;
    }
    items.push(pageNumber);
  }

  return items;
}

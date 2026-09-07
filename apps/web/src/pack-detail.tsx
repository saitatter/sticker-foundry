import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  ImagePlus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { AdminSettings, AuditLogEntry, Pack, PackRole, Sticker, StickerFoundryApi } from './api';
import { useJobQuery } from './features/jobs/queries';
import { queryKeys } from './lib/query-keys';
import { reorderIds } from './lib/reorder';
import { useConfirmDialog } from './components/ui/confirm-dialog';
import {
  CollaborationPanel,
  PackSettingsPanel,
  packSettingsSchema,
  type PackSettingsDraft,
  UploadPanel,
} from './pack-detail-panels';
import { reviewStatusLabel, StickerTile } from './sticker-tile';
import { exportFileName } from './lib/download';
import { LabeledIconButton as IconButton } from './components/ui/labeled-icon-button';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Select } from './components/ui/select';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog';

export type PackDetailTab = 'overview' | 'stickers' | 'collaboration' | 'activity' | 'settings';

const activityPageSizes = [10, 25, 100] as const;
type ActivityPageSize = (typeof activityPageSizes)[number] | 'all';
type ActivityPageItem = number | 'ellipsis';
type PackSettingsErrors = Partial<Record<keyof PackSettingsDraft, string>>;

type PendingPackChanges = {
  optimisticStickers: Sticker[] | null;
  settingsDraft: PackSettingsDraft;
  stickerOrderDirty: boolean;
  trayIconFile: File | null;
};

const pendingPackChanges = new Map<string, PendingPackChanges>();

export function PackDetail({
  api,
  backgroundRemovalStatus,
  pack,
  packs,
  initialTab = 'overview',
  onSectionChange,
  onChanged,
  onDeleted,
  onCloned,
  onError,
  onNotice,
}: {
  api: StickerFoundryApi;
  backgroundRemovalStatus?: AdminSettings['backgroundRemoval'];
  pack: Pack;
  packs: Pack[];
  initialTab?: PackDetailTab;
  onSectionChange?: (section: PackDetailTab) => void;
  onChanged: (message: string) => Promise<void>;
  onDeleted: () => void;
  onCloned: (pack: Pack) => void;
  onError: (error: unknown) => void;
  onNotice: (message: string) => void;
}) {
  const [optimisticStickers, setOptimisticStickers] = useState<Sticker[] | null>(
    () => pendingPackChanges.get(pack.id)?.optimisticStickers ?? null,
  );
  const [stickerOrderDirty, setStickerOrderDirty] = useState(
    () => pendingPackChanges.get(pack.id)?.stickerOrderDirty ?? false,
  );
  const [settingsDraft, setSettingsDraft] = useState<PackSettingsDraft>(
    () => pendingPackChanges.get(pack.id)?.settingsDraft ?? packSettingsFromPack(pack),
  );
  const [trayIconFile, setTrayIconFile] = useState<File | null>(
    () => pendingPackChanges.get(pack.id)?.trayIconFile ?? null,
  );
  const [settingsErrors, setSettingsErrors] = useState<PackSettingsErrors>({});
  const [savingChanges, setSavingChanges] = useState(false);
  const stickers = optimisticStickers ?? pack.stickers ?? [];
  const exportStickerCount = pack.requiresApproval
    ? stickers.filter((sticker) => sticker.reviewStatus === 'APPROVED').length
    : stickers.length;
  const canEdit = pack.canEdit ?? true;
  const canManage = pack.canManage ?? false;
  const canExport = exportStickerCount >= 3 && exportStickerCount <= 30;
  const exportStatusText = exportReadinessMessage(exportStickerCount, pack.requiresApproval, pack.isAnimated);
  const exportActionHintId = `export-actions-${pack.id}`;
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportActionId, setExportActionId] = useState<string | null>(null);
  const [contentsPreview, setContentsPreview] = useState<string | null>(null);
  const [loadingContents, setLoadingContents] = useState(false);
  const [selectedStickerIds, setSelectedStickerIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
  const [bulkEmojis, setBulkEmojis] = useState('');
  const [bulkTargetPackId, setBulkTargetPackId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<PackDetailTab>(initialTab);
  const { confirm, dialog } = useConfirmDialog();
  const exportJobQuery = useJobQuery(api, exportJobId);
  const exportJob = exportJobQuery.data ?? null;
  const exportProgress = exportJob?.progress ?? 0;
  const selectedStickerSet = useMemo(() => new Set(selectedStickerIds), [selectedStickerIds]);
  const hasBulkSelection = selectedStickerIds.length > 0;
  const serverSettings = useMemo(
    () => packSettingsFromPack(pack),
    [pack.description, pack.isAnimated, pack.isPublic, pack.name, pack.publisher, pack.requiresApproval],
  );
  const settingsDirty = canManage && !packSettingsEqual(settingsDraft, pack);
  const hasPendingChanges = stickerOrderDirty || settingsDirty || Boolean(trayIconFile);
  const transferTargets = packs.filter((item) => item.canEdit && item.id !== pack.id);
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const detailTabs = useMemo<Array<{ id: PackDetailTab; label: string }>>(() => {
    const tabs: Array<{ id: PackDetailTab; label: string }> = [
      { id: 'overview', label: 'Overview' },
      { id: 'stickers', label: `Stickers (${stickers.length})` },
      { id: 'activity', label: 'Activity' },
    ];

    if (canManage) tabs.push({ id: 'collaboration', label: 'Collaboration' });
    if (canEdit || canManage) tabs.push({ id: 'settings', label: 'Settings' });
    return tabs;
  }, [canEdit, canManage, stickers.length]);
  const tabButtonId = (tab: PackDetailTab) => `pack-${pack.id}-${tab}-tab`;
  const tabPanelId = (tab: PackDetailTab) => `pack-${pack.id}-${tab}-panel`;

  useEffect(() => {
    setSelectedStickerIds([]);
    setSelectionAnchorId(null);
    setEditingStickerId(null);
    setBulkEmojis('');
    setBulkTargetPackId('');
    setContentsPreview(null);
    setExportJobId(null);
    setActiveTab(initialTab);
  }, [initialTab, pack.id]);

  useEffect(() => {
    const pending = pendingPackChanges.get(pack.id);
    setStickerOrderDirty(pending?.stickerOrderDirty ?? false);
    setSettingsDraft(pending?.settingsDraft ?? serverSettings);
    setTrayIconFile(pending?.trayIconFile ?? null);
    setSettingsErrors({});
    setOptimisticStickers(pending?.optimisticStickers ?? null);
  }, [pack.id, serverSettings]);

  useEffect(() => {
    if (stickerOrderDirty || settingsDirty || trayIconFile) {
      pendingPackChanges.set(pack.id, {
        optimisticStickers,
        settingsDraft,
        stickerOrderDirty,
        trayIconFile,
      });
    } else {
      pendingPackChanges.delete(pack.id);
    }
  }, [optimisticStickers, pack.id, settingsDraft, settingsDirty, stickerOrderDirty, trayIconFile]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setEditingStickerId(null);
  }, [activeTab, pack.id]);

  useEffect(() => {
    setOptimisticStickers(null);
  }, [pack.imageDataVersion]);

  useEffect(() => {
    if (!detailTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, detailTabs]);

  async function downloadCompletedExport() {
    const blob = await api.exportPack(pack.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(pack);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    onNotice('Export ZIP downloaded');
  }

  async function exportPack() {
    setExporting(true);
    try {
      const queued = await api.queueExportPack(pack.id);
      setExportJobId(queued.id);
      queryClient.setQueryData(queryKeys.jobs.detail(queued.id), queued);
    } catch (error) {
      setExporting(false);
      onError(error);
    }
  }

  async function cancelExport() {
    if (!exportJob) return;
    setExportActionId(exportJob.id);
    try {
      const cancelled = await api.cancelJob(exportJob.id);
      queryClient.setQueryData(queryKeys.jobs.detail(exportJob.id), cancelled);
    } catch (error) {
      onError(error);
    } finally {
      setExportActionId(null);
    }
  }

  async function retryExport() {
    if (!exportJob) return;
    setExporting(true);
    setExportActionId(exportJob.id);
    try {
      const queued = await api.retryJob(exportJob.id);
      setExportJobId(queued.id);
      queryClient.setQueryData(queryKeys.jobs.detail(queued.id), queued);
    } catch (error) {
      setExporting(false);
      onError(error);
    } finally {
      setExportActionId(null);
    }
  }

  useEffect(() => {
    if (!exporting || !exportJob) return;
    if (exportJob.status === 'COMPLETED') {
      setExporting(false);
      void downloadCompletedExport().catch(onError);
    } else if (exportJob.status === 'CANCELLED') {
      setExporting(false);
      onNotice('Export cancelled');
    } else if (exportJob.status === 'FAILED') {
      setExporting(false);
      onError(new Error(exportJob.error ?? 'Export could not be completed'));
    }
  }, [exportJob, exporting]);

  async function deletePack() {
    if (
      !(await confirm({
        title: 'Delete pack?',
        description: `This permanently deletes “${pack.name}” and its stickers.`,
        confirmLabel: 'Delete pack',
      }))
    )
      return;
    try {
      await api.deletePack(pack.id);
      onDeleted();
    } catch (error) {
      onError(error);
    }
  }

  async function clonePack() {
    try {
      onCloned(await api.clonePack(pack.id));
    } catch (error) {
      onError(error);
    }
  }

  async function previewContents() {
    if (contentsPreview) {
      setContentsPreview(null);
      return;
    }

    setActiveTab('overview');
    setLoadingContents(true);
    try {
      const contents = await api.exportContents(pack.id);
      setContentsPreview(JSON.stringify(contents, null, 2));
    } catch (error) {
      onError(error);
    } finally {
      setLoadingContents(false);
    }
  }

  async function saveChanges() {
    if (!hasPendingChanges || savingChanges) return;

    let validatedSettings = settingsDraft;
    if (settingsDirty) {
      const result = packSettingsSchema.safeParse(settingsDraft);
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        setSettingsErrors({
          name: fieldErrors.name?.[0],
          publisher: fieldErrors.publisher?.[0],
          description: fieldErrors.description?.[0],
        });
        setActiveTab('settings');
        onSectionChange?.('settings');
        return;
      }
      validatedSettings = result.data;
    }

    setSavingChanges(true);
    try {
      if (settingsDirty) {
        await api.updatePack(pack.id, validatedSettings);
      }
      if (trayIconFile) {
        await api.uploadTrayIcon(pack.id, trayIconFile);
      }
      if (stickerOrderDirty) {
        await api.reorderStickers(
          pack.id,
          stickers.map((sticker) => sticker.id),
        );
      }
      pendingPackChanges.delete(pack.id);
      setOptimisticStickers(null);
      setStickerOrderDirty(false);
      setSettingsDraft(validatedSettings);
      setTrayIconFile(null);
      setSettingsErrors({});
      await onChanged('Changes saved');
    } catch (error) {
      onError(error);
    } finally {
      setSavingChanges(false);
    }
  }

  function discardChanges() {
    pendingPackChanges.delete(pack.id);
    setOptimisticStickers(null);
    setStickerOrderDirty(false);
    setSettingsDraft(serverSettings);
    setTrayIconFile(null);
    setSettingsErrors({});
  }

  function moveSticker(stickerId: string, direction: -1 | 1) {
    const currentIndex = stickers.findIndex((sticker) => sticker.id === stickerId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stickers.length) return;

    const nextStickers = [...stickers];
    [nextStickers[currentIndex], nextStickers[nextIndex]] = [nextStickers[nextIndex], nextStickers[currentIndex]];
    setOptimisticStickers(nextStickers);
    setStickerOrderDirty(true);
  }

  function reorderStickerTo(targetStickerId: string, sourceStickerId: string) {
    const currentOrder = stickers.map((sticker) => sticker.id);
    const nextOrder = reorderIds(currentOrder, sourceStickerId, targetStickerId);
    if (nextOrder === currentOrder) return;

    const nextStickers = nextOrder
      .map((id) => stickers.find((sticker) => sticker.id === id))
      .filter((sticker): sticker is Sticker => Boolean(sticker));
    setOptimisticStickers(nextStickers);
    setStickerOrderDirty(true);
  }

  function handleDndEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    reorderStickerTo(String(event.over.id), String(event.active.id));
  }

  function handleStickerSelection(stickerId: string, event: MouseEvent<HTMLButtonElement>) {
    const clickedIndex = stickers.findIndex((sticker) => sticker.id === stickerId);
    const anchorIndex = selectionAnchorId ? stickers.findIndex((sticker) => sticker.id === selectionAnchorId) : -1;
    const isRangeSelection = event.shiftKey && anchorIndex >= 0 && clickedIndex >= 0;

    if (isRangeSelection) {
      const start = Math.min(anchorIndex, clickedIndex);
      const end = Math.max(anchorIndex, clickedIndex);
      const range = stickers.slice(start, end + 1).map((sticker) => sticker.id);
      setSelectedStickerIds((current) =>
        event.metaKey || event.ctrlKey ? Array.from(new Set([...current, ...range])) : range,
      );
      return;
    }

    setSelectionAnchorId(stickerId);
    setSelectedStickerIds((current) => {
      if (event.metaKey || event.ctrlKey) {
        return current.includes(stickerId) ? current.filter((id) => id !== stickerId) : [...current, stickerId];
      }
      return current.includes(stickerId) ? current.filter((id) => id !== stickerId) : [...current, stickerId];
    });
  }

  function selectRelativeSticker(direction: -1 | 1) {
    if (stickers.length === 0) return;
    const activeId = selectedStickerIds[selectedStickerIds.length - 1];
    const activeIndex = activeId ? stickers.findIndex((sticker) => sticker.id === activeId) : -1;
    const nextIndex =
      activeIndex < 0
        ? direction > 0
          ? 0
          : stickers.length - 1
        : Math.max(0, Math.min(stickers.length - 1, activeIndex + direction));
    const nextId = stickers[nextIndex].id;
    setSelectedStickerIds([nextId]);
    setSelectionAnchorId(nextId);
  }

  function selectAllStickers() {
    setSelectedStickerIds(stickers.map((sticker) => sticker.id));
    setSelectionAnchorId(stickers[0]?.id ?? null);
  }

  async function reviewSelectedStickers(reviewStatus: Sticker['reviewStatus']) {
    if (selectedStickerIds.length === 0 || bulkSaving) return;
    const selectedStickers = stickers.filter((sticker) => selectedStickerIds.includes(sticker.id));
    if (selectedStickers.length === 0) return;

    setBulkSaving(true);
    setOptimisticStickers(
      stickers.map((sticker) => (selectedStickerIds.includes(sticker.id) ? { ...sticker, reviewStatus } : sticker)),
    );
    try {
      for (const sticker of selectedStickers) {
        await api.updateSticker(pack.id, sticker.id, sticker.emojis, sticker.accessibilityText ?? '', reviewStatus);
      }
      await onChanged('Review status updated');
    } catch (error) {
      setOptimisticStickers(null);
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkDeleteStickers() {
    if (selectedStickerIds.length === 0) return;
    if (
      !(await confirm({
        title: 'Delete selected stickers?',
        description: `This permanently deletes ${selectedStickerIds.length} selected sticker(s).`,
        confirmLabel: 'Delete stickers',
      }))
    )
      return;
    setBulkSaving(true);
    try {
      for (const stickerId of selectedStickerIds) {
        await api.deleteSticker(pack.id, stickerId);
      }
      setSelectedStickerIds([]);
      setSelectionAnchorId(null);
      await onChanged('Selected stickers deleted');
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkApplyEmojis() {
    const emojis = bulkEmojis
      .split(',')
      .map((emoji) => emoji.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (selectedStickerIds.length === 0 || emojis.length === 0) return;

    setBulkSaving(true);
    try {
      for (const sticker of stickers.filter((item) => selectedStickerIds.includes(item.id))) {
        await api.updateSticker(pack.id, sticker.id, emojis, sticker.accessibilityText ?? '');
      }
      setSelectedStickerIds([]);
      setSelectionAnchorId(null);
      setBulkEmojis('');
      await onChanged('Emoji updated on selected stickers');
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkGenerateAltText() {
    if (selectedStickerIds.length === 0) return;

    setBulkSaving(true);
    try {
      for (const sticker of stickers.filter((item) => selectedStickerIds.includes(item.id))) {
        await api.updateSticker(
          pack.id,
          sticker.id,
          sticker.emojis,
          generatedAltText(pack, sticker),
          sticker.reviewStatus,
        );
      }
      setSelectedStickerIds([]);
      setSelectionAnchorId(null);
      await onChanged('Alt text generated for selected stickers');
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkTransferStickers(mode: 'copy' | 'move') {
    if (selectedStickerIds.length === 0 || !bulkTargetPackId) return;

    setBulkSaving(true);
    try {
      if (mode === 'copy') {
        await api.copyStickers(pack.id, bulkTargetPackId, selectedStickerIds);
        await onChanged('Selected stickers copied');
      } else {
        await api.moveStickers(pack.id, bulkTargetPackId, selectedStickerIds);
        setSelectedStickerIds([]);
        setSelectionAnchorId(null);
        await onChanged('Selected stickers moved');
      }
    } catch (error) {
      onError(error);
    } finally {
      setBulkSaving(false);
    }
  }

  useEffect(() => {
    if (!canEdit || activeTab !== 'stickers') return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.repeat && key !== 'j' && key !== 'k') return;

      if (key === 'escape') {
        setSelectedStickerIds([]);
        setSelectionAnchorId(null);
        return;
      }
      if (key === 'j') {
        event.preventDefault();
        selectRelativeSticker(1);
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        selectRelativeSticker(-1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault();
        selectAllStickers();
        return;
      }
      if (selectedStickerIds.length === 0) return;
      if (key === 'a') {
        event.preventDefault();
        void reviewSelectedStickers('APPROVED');
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        void reviewSelectedStickers('PENDING');
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        void reviewSelectedStickers('NEEDS_WORK');
        return;
      }
      if (event.shiftKey && selectedStickerIds.length === 1 && event.key === 'ArrowUp') {
        event.preventDefault();
        void moveSticker(selectedStickerIds[0], -1);
        return;
      }
      if (event.shiftKey && selectedStickerIds.length === 1 && event.key === 'ArrowDown') {
        event.preventDefault();
        void moveSticker(selectedStickerIds[0], 1);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <section className="detail">
      <div className="detail-header">
        <div className="detail-header-info">
          <PackHeaderIcon api={api} pack={pack} />
          <div className="detail-header-copy">
            <p className="eyebrow">{pack.isPublic ? 'Public pack' : 'Private pack'}</p>
            <h2>{pack.name}</h2>
            <div className="detail-header-meta">
              <span>{pack.publisher}</span>
              {pack.teamName ? <span>· {pack.teamName}</span> : null}
            </div>
          </div>
        </div>
        <div className="detail-actions">
          <div className="detail-export-actions">
            <div className="detail-export-buttons">
              {hasPendingChanges ? (
                <>
                  <Button
                    className="save-changes-button"
                    disabled={savingChanges}
                    onClick={() => void saveChanges()}
                    type="button"
                  >
                    <Save size={17} />
                    {savingChanges ? 'Saving changes' : 'Save changes'}
                  </Button>
                  <Button
                    className="discard-changes-button"
                    disabled={savingChanges}
                    onClick={discardChanges}
                    type="button"
                    variant="ghost"
                  >
                    <RotateCcw size={17} />
                    Discard
                  </Button>
                </>
              ) : null}
              <Button
                aria-describedby={!canExport ? exportActionHintId : undefined}
                className="secondary-button"
                disabled={!canExport || loadingContents}
                onClick={() => void previewContents()}
                title={!canExport ? exportStatusText : undefined}
                type="button"
                variant="secondary"
              >
                <FileJson size={17} />
                {contentsPreview ? 'Hide JSON' : 'Preview JSON'}
              </Button>
              <Button
                aria-describedby={!canExport ? exportActionHintId : undefined}
                className="secondary-button"
                disabled={!canExport || exporting}
                onClick={() => void exportPack()}
                title={!canExport ? exportStatusText : undefined}
                type="button"
                variant="secondary"
              >
                <Download size={17} />
                {exporting ? `Exporting ${exportProgress}%` : 'Download ZIP'}
              </Button>
              {exporting && exportJob && (exportJob.status === 'QUEUED' || exportJob.status === 'PROCESSING') ? (
                <Button
                  className="secondary-button"
                  disabled={exportActionId === exportJob.id}
                  onClick={() => void cancelExport()}
                  type="button"
                  variant="secondary"
                >
                  <X size={17} />
                  Cancel export
                </Button>
              ) : null}
              {!exporting && exportJob && (exportJob.status === 'FAILED' || exportJob.status === 'CANCELLED') ? (
                <Button
                  className="secondary-button"
                  disabled={exportActionId === exportJob.id}
                  onClick={() => void retryExport()}
                  type="button"
                  variant="secondary"
                >
                  <RotateCcw size={17} />
                  Retry export
                </Button>
              ) : null}
            </div>
            {!canExport ? (
              <span className="detail-action-hint" id={exportActionHintId}>
                {exportStatusText}
              </span>
            ) : null}
          </div>
          <Button className="secondary-button" onClick={() => void clonePack()} type="button" variant="secondary">
            <Copy size={17} />
            Clone
          </Button>
          {canManage ? (
            <IconButton label="Delete pack" onClick={() => void deletePack()} danger>
              <Trash2 size={18} />
            </IconButton>
          ) : null}
        </div>
      </div>

      <Tabs className="detail-tabs" aria-label="Pack sections">
        <TabsList>
          {detailTabs.map((tab) => (
            <TabsTrigger
              aria-controls={tabPanelId(tab.id)}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'active' : undefined}
              id={tabButtonId(tab.id)}
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                onSectionChange?.(tab.id);
              }}
              role="tab"
              type="button"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeTab === 'overview' ? (
        <div
          aria-labelledby={tabButtonId('overview')}
          className="detail-tab-panel"
          id={tabPanelId('overview')}
          role="tabpanel"
        >
          <div className="overview-layout">
            <Card className="overview-summary">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Pack snapshot</p>
                  <h3>Overview</h3>
                </div>
                <Archive size={18} />
              </div>
              <div className="overview-stats">
                <div className="overview-stat">
                  <span>Stickers</span>
                  <strong>{stickers.length}/30</strong>
                  <small>
                    {pack.requiresApproval ? 'Approved stickers count toward export' : 'Ready to arrange and export'}
                  </small>
                </div>
                <div className="overview-stat">
                  <span>Format</span>
                  <strong>{pack.isAnimated ? 'Animated' : 'Static'}</strong>
                  <small>{pack.isAnimated ? 'GIF / animated export' : 'WebP sticker pack'}</small>
                </div>
                <div className="overview-stat">
                  <span>Role</span>
                  <strong>{roleLabel(pack.role)}</strong>
                  <small>{canManage ? 'Can manage this pack' : 'Collaborator access'}</small>
                </div>
                <div className="overview-stat">
                  <span>Export version</span>
                  <strong>{pack.imageDataVersion}</strong>
                  <small>Image data revision</small>
                </div>
                <div className="overview-stat">
                  <span>Exported</span>
                  <strong>{exportStickerCount}/30</strong>
                  <small>{pack.requiresApproval ? 'Approved for export' : 'Included in export'}</small>
                </div>
                <div className="overview-stat">
                  <span>Updated</span>
                  <strong>{new Date(pack.updatedAt).toLocaleDateString()}</strong>
                  <small>Last pack update</small>
                </div>
              </div>
              {pack.description ? <p className="overview-description">{pack.description}</p> : null}
            </Card>

            <ActivityPanel
              api={api}
              compact
              pack={pack}
              onError={onError}
              onViewAll={() => {
                setActiveTab('activity');
                onSectionChange?.('activity');
              }}
            />
          </div>

          <ExportReadiness
            stickerCount={exportStickerCount}
            canExport={canExport}
            requiresApproval={pack.requiresApproval}
            isAnimated={pack.isAnimated}
          />

          {contentsPreview ? <pre className="contents-preview">{contentsPreview}</pre> : null}
        </div>
      ) : null}

      {activeTab === 'stickers' ? (
        <div
          aria-labelledby={tabButtonId('stickers')}
          className="detail-tab-panel"
          id={tabPanelId('stickers')}
          role="tabpanel"
        >
          <div className="stickers-workspace-header">
            <div className="section-heading stickers-heading">
              <div>
                <h3>Stickers</h3>
                <p>Drag to reorder, hover to select, and use Shift-click for a range.</p>
              </div>
              <div className="stickers-heading-meta">
                <span className="counter">{stickers.length}/30</span>
                <Archive size={18} />
              </div>
            </div>
            {canEdit ? (
              <UploadPanel
                api={api}
                backgroundRemovalStatus={backgroundRemovalStatus}
                pack={pack}
                remainingSlots={Math.max(0, 30 - stickers.length)}
                onChanged={onChanged}
                onError={onError}
              />
            ) : null}
          </div>
          <Card className="stickers-section">
            {canEdit && stickers.length > 0 ? (
              <div className={`bulk-toolbar ${hasBulkSelection ? 'active' : 'idle'}`}>
                <span className="counter">{selectedStickerIds.length}</span>
                <Button disabled={bulkSaving} onClick={selectAllStickers} type="button" variant="secondary">
                  Select all
                </Button>
                {hasBulkSelection ? (
                  <>
                    <Button
                      disabled={bulkSaving}
                      onClick={() => {
                        setSelectedStickerIds([]);
                        setSelectionAnchorId(null);
                      }}
                      type="button"
                      variant="secondary"
                    >
                      Clear
                    </Button>
                    <Field label="Emojis" htmlFor="bulk-emojis">
                      <Input
                        id="bulk-emojis"
                        value={bulkEmojis}
                        onChange={(event) => setBulkEmojis(event.target.value)}
                        placeholder="smile,laugh"
                      />
                    </Field>
                    <Button
                      disabled={!bulkEmojis.trim() || bulkSaving}
                      onClick={() => void bulkApplyEmojis()}
                      type="button"
                      variant="secondary"
                    >
                      Apply emoji
                    </Button>
                    <Button
                      disabled={bulkSaving}
                      onClick={() => void bulkGenerateAltText()}
                      type="button"
                      variant="secondary"
                    >
                      Generate alt
                    </Button>
                    <Button
                      className="danger-button"
                      disabled={bulkSaving}
                      onClick={() => void bulkDeleteStickers()}
                      type="button"
                      variant="secondary"
                    >
                      Delete selected
                    </Button>
                    <Field label="Target" htmlFor="bulk-target-pack">
                      <Select
                        id="bulk-target-pack"
                        disabled={transferTargets.length === 0}
                        value={bulkTargetPackId}
                        onChange={(event) => setBulkTargetPackId(event.target.value)}
                      >
                        <option value="">Choose pack</option>
                        {transferTargets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name} ({target.stickerCount}/30)
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button
                      disabled={!bulkTargetPackId || bulkSaving}
                      onClick={() => void bulkTransferStickers('copy')}
                      type="button"
                      variant="secondary"
                    >
                      Copy
                    </Button>
                    <Button
                      disabled={!bulkTargetPackId || bulkSaving}
                      onClick={() => void bulkTransferStickers('move')}
                      type="button"
                      variant="secondary"
                    >
                      Move
                    </Button>
                  </>
                ) : (
                  <span className="bulk-toolbar-note">Select stickers to show bulk actions</span>
                )}
              </div>
            ) : null}
            {stickers.length > 0 ? (
              <DndContext collisionDetection={closestCenter} onDragEnd={handleDndEnd} sensors={dndSensors}>
                <SortableContext items={stickers.map((sticker) => sticker.id)} strategy={rectSortingStrategy}>
                  <div className="sticker-grid">
                    {stickers.map((sticker) => (
                      <SortableSticker disabled={!canEdit || editingStickerId !== null} id={sticker.id} key={sticker.id}>
                        {(isDragging) => (
                          <StickerTile
                            api={api}
                            backgroundRemovalStatus={backgroundRemovalStatus}
                            isAnimatedPack={pack.isAnimated}
                            packId={pack.id}
                            transferTargets={transferTargets}
                            sticker={sticker}
                            version={pack.imageDataVersion}
                            canEdit={canEdit}
                            isDragging={isDragging}
                            isSelected={selectedStickerSet.has(sticker.id)}
                            onChanged={() => onChanged('Sticker updated')}
                            onDeleted={() => onChanged('Sticker deleted')}
                            onError={onError}
                            onEditingChange={(isEditing) =>
                              setEditingStickerId((current) => {
                                if (isEditing) return sticker.id;
                                return current === sticker.id ? null : current;
                              })
                            }
                            onSelectedChange={(event) => handleStickerSelection(sticker.id, event)}
                          />
                        )}
                      </SortableSticker>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="empty-inline">
                <ImagePlus size={22} />
                <span>No stickers yet</span>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {activeTab === 'collaboration' && canManage ? (
        <div
          aria-labelledby={tabButtonId('collaboration')}
          className="detail-tab-panel"
          id={tabPanelId('collaboration')}
          role="tabpanel"
        >
          <CollaborationPanel api={api} pack={pack} onChanged={onChanged} onError={onError} onNotice={onNotice} />
        </div>
      ) : null}

      {activeTab === 'activity' ? (
        <div
          aria-labelledby={tabButtonId('activity')}
          className="detail-tab-panel"
          id={tabPanelId('activity')}
          role="tabpanel"
        >
          <ActivityPanel api={api} pack={pack} onError={onError} />
        </div>
      ) : null}

      {activeTab === 'settings' && (canEdit || canManage) ? (
        <div
          aria-labelledby={tabButtonId('settings')}
          className="detail-tab-panel"
          id={tabPanelId('settings')}
          role="tabpanel"
        >
          <PackSettingsPanel
            api={api}
            canEdit={canEdit}
            canManage={canManage}
            draft={settingsDraft}
            errors={settingsErrors}
            hasDirty={settingsDirty || Boolean(trayIconFile)}
            pack={pack}
            trayIconFile={trayIconFile}
            onDraftChange={setSettingsDraft}
            onTrayIconFileChange={setTrayIconFile}
          />
        </div>
      ) : null}
      {dialog}
    </section>
  );
}

function SortableSticker({
  disabled = false,
  id,
  children,
}: {
  disabled?: boolean;
  id: string;
  children: (isDragging: boolean) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      data-reorder-disabled={disabled ? 'true' : undefined}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }}
      {...attributes}
      aria-disabled={undefined}
      {...listeners}
    >
      {children(isDragging)}
    </div>
  );
}

function PackHeaderIcon({ api, pack }: { api: StickerFoundryApi; pack: Pack }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    api
      .trayIconBlob(pack.id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, pack.id, pack.imageDataVersion]);

  return (
    <div aria-label={`${pack.name} sticker pack icon`} className="pack-header-icon" role="img">
      {url ? <img alt="" src={url} /> : <Archive aria-hidden="true" size={28} />}
    </div>
  );
}

function ActivityPanel({
  api,
  compact = false,
  pack,
  onError,
  onViewAll,
}: {
  api: StickerFoundryApi;
  compact?: boolean;
  pack: Pack;
  onError: (error: unknown) => void;
  onViewAll?: () => void;
}) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ActivityPageSize>(10);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .packActivity(pack.id, compact ? 1 : undefined)
      .then((nextEntries) => {
        if (alive) setEntries(nextEntries);
      })
      .catch(onError)
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [api, compact, onError, pack.id]);

  useEffect(() => {
    setPage(1);
  }, [pack.id]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleEntries = useMemo(() => {
    if (pageSize === 'all') {
      return entries;
    }
    const start = (currentPage - 1) * pageSize;
    return entries.slice(start, start + pageSize);
  }, [currentPage, entries, pageSize]);
  const pageItems = useMemo(() => activityPaginationItems(currentPage, totalPages), [currentPage, totalPages]);
  const firstVisibleEntry = entries.length === 0 ? 0 : pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1;
  const lastVisibleEntry = pageSize === 'all' ? entries.length : Math.min(entries.length, currentPage * pageSize);
  const renderedEntries = compact ? entries.slice(0, 1) : visibleEntries;

  function handlePageSizeChange(value: string) {
    const parsed = Number(value);
    const nextPageSize: ActivityPageSize =
      value === 'all'
        ? 'all'
        : activityPageSizes.includes(parsed as (typeof activityPageSizes)[number])
          ? (parsed as (typeof activityPageSizes)[number])
          : 10;
    setPageSize(nextPageSize);
    setPage(1);
  }

  return (
    <Card className={compact ? 'last-activity-card' : 'activity-panel'}>
      <div className="section-heading">
        <div>
          {compact ? <p className="eyebrow">Recent</p> : null}
          <h3>{compact ? 'Last activity' : 'Activity'}</h3>
          <p>{compact ? 'The latest change in this pack.' : 'Track pack changes and collaboration events.'}</p>
        </div>
        <div className="activity-heading-meta">
          {!compact ? <span className="counter">{entries.length}</span> : null}
          <Archive size={18} />
        </div>
      </div>
      <div className={compact ? 'last-activity-content' : 'activity-list'}>
        {loading ? <span className="muted-row">Loading activity</span> : null}
        {renderedEntries.map((entry) => (
          <ActivityEntryRow entry={entry} key={entry.id} onSelect={setSelectedEntry} />
        ))}
        {!loading && entries.length === 0 ? <span className="muted-row">No activity yet.</span> : null}
      </div>
      {!compact && !loading && entries.length > 0 ? (
        <div className="activity-pagination">
          <span className="activity-pagination-summary">
            Showing {firstVisibleEntry}–{lastVisibleEntry} of {entries.length}
          </span>
          <div className="activity-pagination-controls" aria-label="Activity pagination">
            <Button
              aria-label="Previous activity page"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ChevronLeft size={16} />
              Previous
            </Button>
            <div className="activity-page-buttons">
              {pageItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span className="activity-page-ellipsis" key={`ellipsis-${index}`}>
                    …
                  </span>
                ) : (
                  <button
                    aria-current={currentPage === item ? 'page' : undefined}
                    aria-label={`Activity page ${item}`}
                    className={`activity-page-button${currentPage === item ? ' active' : ''}`}
                    key={item}
                    onClick={() => setPage(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <Button
              aria-label="Next activity page"
              disabled={currentPage === totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
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
              aria-label="Activities per page"
              value={pageSize}
              onChange={(event) => handlePageSizeChange(event.target.value)}
            >
              {activityPageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
              <option value="all">All</option>
            </Select>
          </label>
        </div>
      ) : null}
      {compact && !loading && onViewAll ? (
        <Button className="last-activity-link" onClick={onViewAll} size="sm" type="button" variant="ghost">
          View full activity
          <ChevronRight size={16} />
        </Button>
      ) : null}
      {selectedEntry ? (
        <Dialog open onOpenChange={(open) => !open && setSelectedEntry(null)}>
          <DialogContent className="activity-detail-dialog">
            <DialogHeader>
              <p className="eyebrow">Activity detail</p>
              <DialogTitle>{auditActionLabel(selectedEntry.action)}</DialogTitle>
              <DialogDescription>
                {selectedEntry.actor?.email ?? 'System'} · {new Date(selectedEntry.createdAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <ActivityChangeDetails entry={selectedEntry} />
            <div className="dialog-actions">
              <Button onClick={() => setSelectedEntry(null)} type="button" variant="secondary">
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}

function ActivityEntryRow({ entry, onSelect }: { entry: AuditLogEntry; onSelect: (entry: AuditLogEntry) => void }) {
  return (
    <button
      aria-label={`View ${auditActionLabel(entry.action)} activity details`}
      className="activity-row activity-row-button"
      onClick={() => onSelect(entry)}
      type="button"
    >
      <span>
        <strong>{auditActionLabel(entry.action)}</strong>
        <small>
          {entry.actor?.email ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}
        </small>
      </span>
      <small>{entry.entityType}</small>
    </button>
  );
}

function ActivityChangeDetails({ entry }: { entry: AuditLogEntry }) {
  const metadata = asRecord(entry.metadata);
  const before = metadata?.before;
  const after = metadata?.after;
  const extraMetadata = metadata
    ? Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== 'before' && key !== 'after'))
    : null;
  const hasExtraMetadata = Boolean(extraMetadata && Object.keys(extraMetadata).length > 0);

  return (
    <div className="activity-detail-content">
      <div className="activity-detail-context">
        <span className="status-pill">{entry.entityType}</span>
        {entry.entityId ? <span>#{entry.entityId}</span> : null}
      </div>
      <div className="activity-diff-grid">
        <ActivitySnapshot label="Before" value={before} />
        <ActivitySnapshot label="After" value={after} />
      </div>
      {hasExtraMetadata ? (
        <details className="activity-metadata">
          <summary>Event metadata</summary>
          <pre>{JSON.stringify(extraMetadata, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function ActivitySnapshot({ label, value }: { label: string; value: unknown }) {
  const snapshot = value === undefined ? 'No snapshot recorded for this event.' : JSON.stringify(value, null, 2);

  return (
    <section className="activity-snapshot">
      <h4>{label}</h4>
      <pre>{snapshot}</pre>
    </section>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function activityPaginationItems(currentPage: number, totalPages: number): ActivityPageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const items: ActivityPageItem[] = [];

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

function ExportReadiness({
  stickerCount,
  canExport,
  requiresApproval,
  isAnimated,
}: {
  stickerCount: number;
  canExport: boolean;
  requiresApproval: boolean;
  isAnimated: boolean;
}) {
  const message = exportReadinessMessage(stickerCount, requiresApproval, isAnimated);

  return (
    <Card className={`export-panel ${canExport ? 'ready' : 'blocked'}`}>
      <div className="export-status">
        {canExport ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        <div>
          <h3>{canExport ? 'WhatsApp export ready' : 'WhatsApp export blocked'}</h3>
          <p>
            {canExport
              ? `${requiresApproval ? 'Approved stickers' : 'Ordered stickers'} are included in the ${isAnimated ? 'animated' : 'static'} contents.json and ZIP.`
              : message}
          </p>
        </div>
      </div>
      <span className="export-count">{stickerCount}/30</span>
    </Card>
  );
}

function exportReadinessMessage(stickerCount: number, requiresApproval: boolean, isAnimated: boolean) {
  if (stickerCount < 3) {
    const missing = 3 - stickerCount;
    return `${missing} more ${requiresApproval ? 'approved ' : ''}sticker${missing === 1 ? '' : 's'} needed for this ${isAnimated ? 'animated' : 'static'} pack.`;
  }
  if (stickerCount > 30) {
    return `Remove ${stickerCount - 30} sticker${stickerCount - 30 === 1 ? '' : 's'} to stay under the WhatsApp 30 sticker limit.`;
  }
  return 'Export is blocked until this pack meets the WhatsApp sticker rules.';
}

function packSettingsFromPack(pack: Pack): PackSettingsDraft {
  return {
    name: pack.name,
    publisher: pack.publisher,
    description: pack.description ?? '',
    isPublic: pack.isPublic,
    requiresApproval: pack.requiresApproval,
    isAnimated: pack.isAnimated,
  };
}

function packSettingsEqual(draft: PackSettingsDraft, pack: Pack) {
  return (
    draft.name === pack.name &&
    draft.publisher === pack.publisher &&
    draft.description === (pack.description ?? '') &&
    draft.isPublic === pack.isPublic &&
    draft.requiresApproval === pack.requiresApproval &&
    draft.isAnimated === pack.isAnimated
  );
}

function roleLabel(role?: PackRole) {
  if (role === 'OWNER') return 'Owner';
  if (role === 'EDITOR') return 'Editor';
  if (role === 'VIEWER') return 'Viewer';
  return 'Private';
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

function auditActionLabel(action: string) {
  return action
    .split('.')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function generatedAltText(pack: Pack, sticker: Sticker) {
  const emojiText = sticker.emojis.filter(Boolean).join(' ');
  const status = reviewStatusLabel(sticker.reviewStatus).toLowerCase();
  const parts = [`${pack.name} sticker`];
  if (emojiText) parts.push(`with ${emojiText}`);
  parts.push(`marked ${status}`);
  return parts.join(' ').slice(0, 125);
}

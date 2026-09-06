import { AlertCircle, Archive, CheckCircle2, Copy, Download, FileJson, ImagePlus, RotateCcw, Trash2, X } from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminSettings, AuditLogEntry, Pack, PackRole, Sticker, StickerFoundryApi } from './api';
import { useJobQuery } from './features/jobs/queries';
import { queryKeys } from './lib/query-keys';
import { useConfirmDialog } from './components/ui/confirm-dialog';
import { CollaborationPanel, PackEditForm, TrayIconPanel, UploadPanel } from './pack-detail-panels';
import { reviewStatusLabel, StickerTile } from './sticker-tile';
import { exportFileName } from './lib/download';
import { LabeledIconButton as IconButton } from './components/ui/labeled-icon-button';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Field } from './components/ui/field';
import { Input } from './components/ui/input';
import { Metric } from './components/ui/metric';
import { Select } from './components/ui/select';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';

export type PackDetailTab = 'overview' | 'stickers' | 'collaboration' | 'activity' | 'settings';

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
  const [optimisticStickers, setOptimisticStickers] = useState<Sticker[] | null>(null);
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
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(null);
  const [selectedStickerIds, setSelectedStickerIds] = useState<string[]>([]);
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
    setBulkEmojis('');
    setBulkTargetPackId('');
    setOptimisticStickers(null);
    setContentsPreview(null);
    setExportJobId(null);
    setActiveTab(initialTab);
  }, [initialTab, pack.id]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
    if (!(await confirm({
      title: 'Delete pack?',
      description: `This permanently deletes “${pack.name}” and its stickers.`,
      confirmLabel: 'Delete pack',
    }))) return;
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

  async function moveSticker(stickerId: string, direction: -1 | 1) {
    const currentIndex = stickers.findIndex((sticker) => sticker.id === stickerId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stickers.length) return;

    const nextOrder = stickers.map((sticker) => sticker.id);
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
    const nextStickers = [...stickers];
    [nextStickers[currentIndex], nextStickers[nextIndex]] = [nextStickers[nextIndex], nextStickers[currentIndex]];
    setOptimisticStickers(nextStickers);

    try {
      await api.reorderStickers(pack.id, nextOrder);
      await onChanged('Sticker order updated');
    } catch (error) {
      setOptimisticStickers(null);
      onError(error);
    }
  }

  async function reorderStickerTo(targetStickerId: string, sourceStickerId = draggingStickerId) {
    if (!sourceStickerId || sourceStickerId === targetStickerId) return;

    const currentIndex = stickers.findIndex((sticker) => sticker.id === sourceStickerId);
    const targetIndex = stickers.findIndex((sticker) => sticker.id === targetStickerId);
    if (currentIndex < 0 || targetIndex < 0) return;

    const nextOrder = stickers.map((sticker) => sticker.id);
    const [movedStickerId] = nextOrder.splice(currentIndex, 1);
    const insertIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextOrder.splice(insertIndex, 0, movedStickerId);
    const nextStickers = nextOrder
      .map((id) => stickers.find((sticker) => sticker.id === id))
      .filter((sticker): sticker is Sticker => Boolean(sticker));
    setOptimisticStickers(nextStickers);

    try {
      await api.reorderStickers(pack.id, nextOrder);
      await onChanged('Sticker order updated');
    } catch (error) {
      setOptimisticStickers(null);
      onError(error);
    } finally {
      setDraggingStickerId(null);
    }
  }

  function handleDndEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    void reorderStickerTo(String(event.over.id), String(event.active.id));
  }

  function toggleStickerSelection(stickerId: string, selected: boolean) {
    setSelectedStickerIds((current) => {
      if (selected) return current.includes(stickerId) ? current : [...current, stickerId];
      return current.filter((id) => id !== stickerId);
    });
  }

  function selectRelativeSticker(direction: -1 | 1) {
    if (stickers.length === 0) return;
    setSelectedStickerIds((current) => {
      const activeId = current[current.length - 1];
      const activeIndex = activeId ? stickers.findIndex((sticker) => sticker.id === activeId) : -1;
      const nextIndex =
        activeIndex < 0
          ? direction > 0
            ? 0
            : stickers.length - 1
          : Math.max(0, Math.min(stickers.length - 1, activeIndex + direction));
      return [stickers[nextIndex].id];
    });
  }

  function selectAllStickers() {
    setSelectedStickerIds(stickers.map((sticker) => sticker.id));
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
    if (!(await confirm({
      title: 'Delete selected stickers?',
      description: `This permanently deletes ${selectedStickerIds.length} selected sticker(s).`,
      confirmLabel: 'Delete stickers',
    }))) return;
    setBulkSaving(true);
    try {
      for (const stickerId of selectedStickerIds) {
        await api.deleteSticker(pack.id, stickerId);
      }
      setSelectedStickerIds([]);
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
        <div>
          <p className="eyebrow">{pack.isPublic ? 'Public pack' : 'Private pack'}</p>
          <h2>{pack.name}</h2>
          <p>{pack.publisher}</p>
        </div>
        <div className="detail-actions">
          <div className="detail-export-actions">
            <div className="detail-export-buttons">
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

      {canEdit ? (
        <div hidden={activeTab !== 'stickers'}>
          <UploadPanel
            api={api}
            backgroundRemovalStatus={backgroundRemovalStatus}
            pack={pack}
            remainingSlots={Math.max(0, 30 - stickers.length)}
            onChanged={onChanged}
            onError={onError}
          />
        </div>
      ) : null}

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
          <div className="stats-grid">
            <Metric label="Stickers" value={`${stickers.length}/30`} />
            <Metric label="Export" value={`${exportStickerCount}/30`} />
            <Metric label="Format" value={pack.isAnimated ? 'Animated' : 'Static'} />
            <Metric label="Role" value={roleLabel(pack.role)} />
            <Metric label="Version" value={pack.imageDataVersion} />
            <Metric label="Updated" value={new Date(pack.updatedAt).toLocaleDateString()} />
          </div>

          <ExportReadiness
            stickerCount={exportStickerCount}
            canExport={canExport}
            requiresApproval={pack.requiresApproval}
            isAnimated={pack.isAnimated}
          />

          {contentsPreview ? <pre className="contents-preview">{contentsPreview}</pre> : null}

          <ActivityPanel api={api} pack={pack} onError={onError} />
        </div>
      ) : null}

      {activeTab === 'stickers' ? (
        <div
          aria-labelledby={tabButtonId('stickers')}
          className="detail-tab-panel"
          id={tabPanelId('stickers')}
          role="tabpanel"
        >
          <Card className="stickers-section">
            <div className="section-heading">
              <h3>Stickers</h3>
              <Archive size={18} />
            </div>
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
                      onClick={() => setSelectedStickerIds([])}
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
                    {stickers.map((sticker, index) => (
                      <SortableSticker key={sticker.id} id={sticker.id}>
                        <StickerTile
                          api={api}
                          backgroundRemovalStatus={backgroundRemovalStatus}
                          isAnimatedPack={pack.isAnimated}
                          packId={pack.id}
                          transferTargets={transferTargets}
                          sticker={sticker}
                          version={pack.imageDataVersion}
                          canEdit={canEdit}
                          canMoveDown={index < stickers.length - 1}
                          canMoveUp={index > 0}
                          isDragging={draggingStickerId === sticker.id}
                          isSelected={selectedStickerSet.has(sticker.id)}
                          onChanged={() => onChanged('Sticker updated')}
                          onDeleted={() => onChanged('Sticker deleted')}
                          onDragEnd={() => setDraggingStickerId(null)}
                          onDragStart={() => setDraggingStickerId(sticker.id)}
                          onDrop={() => void reorderStickerTo(sticker.id)}
                          onError={onError}
                          onMoveDown={() => moveSticker(sticker.id, 1)}
                          onMoveUp={() => moveSticker(sticker.id, -1)}
                          onSelectedChange={(selected) => toggleStickerSelection(sticker.id, selected)}
                        />
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
          {canManage ? <PackEditForm api={api} pack={pack} onChanged={onChanged} onError={onError} /> : null}

          {canEdit ? <TrayIconPanel api={api} pack={pack} onChanged={onChanged} onError={onError} /> : null}
        </div>
      ) : null}
      {dialog}
    </section>
  );
}

function SortableSticker({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function ActivityPanel({
  api,
  pack,
  onError,
}: {
  api: StickerFoundryApi;
  pack: Pack;
  onError: (error: unknown) => void;
}) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .packActivity(pack.id)
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
  }, [api, onError, pack.id]);

  return (
    <Card className="activity-panel">
      <div className="section-heading">
        <h3>Activity</h3>
        <Archive size={18} />
      </div>
      <div className="activity-list">
        {loading ? <span className="muted-row">Loading activity</span> : null}
        {entries.map((entry) => (
          <div className="activity-row" key={entry.id}>
            <span>
              <strong>{auditActionLabel(entry.action)}</strong>
              <small>
                {entry.actor?.email ?? 'System'} · {new Date(entry.createdAt).toLocaleString()}
              </small>
            </span>
            <small>{entry.entityType}</small>
          </div>
        ))}
        {!loading && entries.length === 0 ? <span className="muted-row">No activity yet.</span> : null}
      </div>
    </Card>
  );
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

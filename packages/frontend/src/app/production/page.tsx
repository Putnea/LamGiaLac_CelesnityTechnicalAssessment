'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Factory,
  RefreshCw,
  Clock,
  Ban,
  CheckCircle2,
  PlayCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  Filter,
  Layers,
  ArrowRight,
  Loader2,
  Trash2,
  Flame,
  RotateCcw,
} from 'lucide-react';
import {
  api,
  LineSummary,
  ProductionLineView,
  StationSummary,
  BatchView,
  BatchState,
  StationCode,
  STATION_ORDER,
} from '../../lib/api';
import { BatchDetailModal } from '../../components/production/BatchDetailModal';

export default function ProductionPage() {
  const [lines, setLines] = useState<LineSummary[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string>('LINE-A');
  const [lineDetails, setLineDetails] = useState<ProductionLineView | null>(null);
  const [allBatches, setAllBatches] = useState<BatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [datasetStats, setDatasetStats] = useState<{ active: number; softDeleted: number; total: number } | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchView | null>(null);
  const [filterState, setFilterState] = useState<string>('ALL');
  const [selectedStationFilter, setSelectedStationFilter] = useState<StationCode | null>(null);

  const selectedLineRef = useRef(selectedLineId);
  selectedLineRef.current = selectedLineId;
  const selectedBatchRef = useRef(selectedBatch);
  selectedBatchRef.current = selectedBatch;

  async function loadData(initial = false) {
    if (initial) setLoading(true);
    try {
      const [linesData, batchesData, stats] = await Promise.all([
        api.getLines(),
        api.getAllBatches(),
        api.getEventStats().catch(() => null),
      ]);
      setLines(linesData);
      setAllBatches(batchesData);
      if (stats) setDatasetStats(stats);

      // Keep open modal in sync with latest batch data
      if (selectedBatchRef.current) {
        const matching = batchesData.find((b) => b.batchId === selectedBatchRef.current?.batchId);
        if (matching) setSelectedBatch(matching);
      }

      const currentLine = selectedLineRef.current;
      if (currentLine && currentLine !== 'ALL') {
        const details = await api.getLineDetails(currentLine);
        setLineDetails(details);
      }
    } catch {
      // ignore
    } finally {
      if (initial) setLoading(false);
    }
  }

  async function handleSoftDeleteAll() {
    if (!confirm('Are you sure you want to soft-delete all normalized records? Records will be hidden from the active dashboard but retained for audit history.')) return;
    setActionLoading(true);
    try {
      const res = await api.softDeleteAllEvents();
      await loadData(true);
      alert(`Successfully soft-deleted ${res.affected} records.`);
    } catch (err: any) {
      alert(err.message || 'Failed to soft-delete records');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestoreAll() {
    setActionLoading(true);
    try {
      const res = await api.restoreAllEvents();
      await loadData(true);
      alert(`Successfully restored ${res.affected} records.`);
    } catch (err: any) {
      alert(err.message || 'Failed to restore records');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePurgeAll() {
    if (!confirm('CAUTION: Are you sure you want to permanently PURGE all normalized records? This will delete all canonical events completely and cannot be undone.')) return;
    setActionLoading(true);
    try {
      const res = await api.purgeAllEvents();
      await loadData(true);
      alert(`Successfully purged ${res.affected} records permanently.`);
    } catch (err: any) {
      alert(err.message || 'Failed to purge records');
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    loadData(true);
    const interval = setInterval(() => loadData(false), 10000); // silent polling every 10s
    return () => clearInterval(interval);
  }, []);

  const PAGE_SIZE_OPTIONS = [2, 4, 6, 8, 10, 12, 20];

  async function handleSelectLine(lineId: string) {
    setSelectedLineId(lineId);
    setSelectedStationFilter(null); // Reset station filter on line switch
    if (lineId === 'ALL') {
      setLineDetails(null);
      return;
    }
    setLoading(true);
    try {
      const details = await api.getLineDetails(lineId);
      setLineDetails(details);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function handleToggleStationFilter(stationCode: StationCode) {
    setSelectedStationFilter((prev) => (prev === stationCode ? null : stationCode));
  }

  const displayedBatches = (selectedLineId === 'ALL' || !lineDetails
    ? allBatches
    : lineDetails.batches
  ).filter((b) => {
    if (selectedStationFilter && b.currentStation !== selectedStationFilter) return false;
    if (filterState === 'ALL') return true;
    if (filterState === 'STALE') return b.indicators.isStale;
    if (filterState === 'MISSING') return b.indicators.hasMissingData;
    if (filterState === 'CONFLICT') return b.indicators.hasConflict;
    return b.state === filterState;
  });

  // Calculate station summary for the active line or aggregated across All Lines
  const activeStations: StationSummary[] =
    selectedLineId !== 'ALL' && lineDetails
      ? lineDetails.stations
      : STATION_ORDER.map((stationCode) => {
        const isDispatch = stationCode === StationCode.DISPATCH;
        const wipBatches = allBatches.filter(
          (b) => b.currentStation === stationCode && b.state !== BatchState.COMPLETED
        );
        const completedBatches = allBatches.filter(
          (b) => b.state === BatchState.COMPLETED
        );
        const completedQuantity = allBatches
          .flatMap((b) =>
            b.stationHistory.filter(
              (h) => h.stationCode === stationCode && h.status === 'ACCEPTED'
            )
          )
          .reduce((sum, h) => sum + h.quantity, 0);
        const isStale = allBatches.some(
          (b) => b.currentStation === stationCode && b.indicators.isStale
        );
        return {
          stationCode,
          wip: isDispatch ? completedBatches.length : wipBatches.length,
          completedQuantity,
          lastEventTime: null,
          dataFreshnessMinutes: null,
          isStale,
        };
      });

  const aggregateSummary = {
    total: allBatches.length,
    completed: allBatches.filter((b) => b.state === BatchState.COMPLETED).length,
    inProgress: allBatches.filter((b) => b.state === BatchState.IN_PROGRESS).length,
    blocked: allBatches.filter((b) => b.state === BatchState.BLOCKED).length,
    planned: allBatches.filter((b) => b.state === BatchState.PLANNED).length,
    stale: allBatches.filter((b) => b.indicators.isStale).length,
  };

  function getStateBadge(state: BatchState) {
    switch (state) {
      case BatchState.COMPLETED:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">COMPLETED</span>;
      case BatchState.BLOCKED:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">BLOCKED</span>;
      case BatchState.IN_PROGRESS:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">IN PROGRESS</span>;
      case BatchState.PLANNED:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">PLANNED</span>;
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center space-x-2.5">
            <Factory className="w-7 h-7 text-blue-500" />
            <span>Production Lines & Traceability</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time multi-station visibility, batch state machine tracking, and station WIP breakdown.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Restore Soft-Deleted (if any exist) */}
          {(datasetStats?.softDeleted ?? 0) > 0 && (
            <button
              onClick={handleRestoreAll}
              disabled={actionLoading}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-semibold shadow-sm transition disabled:opacity-50"
              title="Restore all soft-deleted records back to active state"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore ({datasetStats?.softDeleted})</span>
            </button>
          )}

          {/* Soft Delete All */}
          <button
            onClick={handleSoftDeleteAll}
            disabled={actionLoading || aggregateSummary.total === 0}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-semibold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Soft-delete all canonical events (retains audit trail)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Soft Delete All</span>
          </button>

          {/* Purge All (Hard Reset) */}
          <button
            onClick={handlePurgeAll}
            disabled={actionLoading || (aggregateSummary.total === 0 && (datasetStats?.softDeleted ?? 0) === 0)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-semibold shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Permanently purge all canonical events"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Purge All</span>
          </button>

          {/* Refresh Dashboard */}
          <button
            onClick={() => loadData(true)}
            disabled={actionLoading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Batches</span>
          <span className="text-2xl font-bold text-slate-100 mt-1">{aggregateSummary.total}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-xs text-blue-400 font-medium uppercase tracking-wider flex items-center space-x-1">
            <PlayCircle className="w-3.5 h-3.5" />
            <span>In Progress</span>
          </span>
          <span className="text-2xl font-bold text-slate-100 mt-1">{aggregateSummary.inProgress}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-xs text-rose-400 font-medium uppercase tracking-wider flex items-center space-x-1">
            <Ban className="w-3.5 h-3.5" />
            <span>Blocked</span>
          </span>
          <span className="text-2xl font-bold text-slate-100 mt-1">{aggregateSummary.blocked}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-xs text-emerald-400 font-medium uppercase tracking-wider flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed</span>
          </span>
          <span className="text-2xl font-bold text-slate-100 mt-1">{aggregateSummary.completed}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Planned</span>
          <span className="text-2xl font-bold text-slate-100 mt-1">{aggregateSummary.planned}</span>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-xs text-red-400 font-medium uppercase tracking-wider flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Stale Batches</span>
          </span>
          <span className="text-2xl font-bold text-slate-100 mt-1">{aggregateSummary.stale}</span>
        </div>
      </div>

      {/* Production Line Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex space-x-2">
          {lines.map((l) => (
            <button
              key={l.lineId}
              onClick={() => handleSelectLine(l.lineId)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedLineId === l.lineId
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
                }`}
            >
              {l.lineId}
            </button>
          ))}
          <button
            onClick={() => handleSelectLine('ALL')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedLineId === 'ALL'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
          >
            All Lines
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto text-xs font-semibold">
          <span className="text-slate-500 mr-1 flex items-center"><Filter className="w-3 h-3 mr-1" /> Filter:</span>
          {['ALL', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'PLANNED', 'STALE', 'MISSING'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterState(st)}
              className={`px-2.5 py-1 rounded-lg border transition ${filterState === st
                ? 'bg-slate-800 text-slate-100 border-slate-600'
                : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* 6-Station Pipeline Board (always visible for selected line or All Lines) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
            <span>6-Station Operational Flow — {selectedLineId === 'ALL' ? 'All Lines (Factory Total)' : selectedLineId}</span>
            {selectedStationFilter && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold">
                Filtered by {selectedStationFilter}
              </span>
            )}
          </span>
          <span className="font-mono text-[11px] text-slate-500">Click any station to filter batches</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {activeStations.map((st, i) => {
            const isSelected = selectedStationFilter === st.stationCode;
            return (
              <button
                key={st.stationCode}
                onClick={() => handleToggleStationFilter(st.stationCode)}
                className={`p-4 rounded-2xl text-left flex flex-col justify-between transition-all cursor-pointer relative group ${isSelected
                  ? 'bg-blue-950/50 border-2 border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/30 scale-[1.02]'
                  : 'bg-slate-900/60 border border-slate-800/80 hover:border-slate-600 hover:bg-slate-900/90'
                  }`}
                title={`Click to ${isSelected ? 'clear filter' : `filter batches at ${st.stationCode}`}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-blue-400' : 'text-slate-500'}`}>
                      Step {i + 1}
                    </span>
                    <div className="flex items-center space-x-1">
                      {st.isStale && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Stale
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white shadow-sm">
                          Selected
                        </span>
                      )}
                    </div>
                  </div>
                  <h4 className={`font-bold text-sm tracking-tight ${isSelected ? 'text-blue-300' : 'text-slate-100 group-hover:text-blue-400'}`}>
                    {st.stationCode}
                  </h4>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500">
                      {st.stationCode === StationCode.DISPATCH ? 'Completed' : 'Active WIP'}
                    </div>
                    <div className={`font-bold text-base ${isSelected ? 'text-blue-300' : 'text-blue-400'}`}>{st.wip}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">Completed Qty</div>
                    <div className="font-bold text-slate-200 text-sm">{st.completedQuantity} pcs</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Batches Table / Cards */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="font-bold uppercase tracking-wider text-slate-300">
              Batch Traceability & State ({displayedBatches.length})
            </span>
            {selectedStationFilter && (
              <button
                onClick={() => setSelectedStationFilter(null)}
                className="px-2 py-0.5 rounded-full text-[11px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 flex items-center space-x-1 transition"
              >
                <span>Station: <strong>{selectedStationFilter}</strong></span>
                <span className="font-bold">✕</span>
              </button>
            )}
          </div>
          <span className="text-slate-500">Click any batch card for full provenance history & management actions</span>
        </div>

        {displayedBatches.length === 0 ? (
          <div className="py-12 text-center rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-500 text-sm">
            No batches match the current filter or line selection.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedBatches.map((batch) => (
              <div
                key={batch.batchId}
                onClick={() => setSelectedBatch(batch)}
                className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/60 hover:bg-slate-900/80 transition-all cursor-pointer shadow-sm group flex flex-col justify-between space-y-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-base text-slate-100 group-hover:text-blue-400 transition">
                        {batch.batchId}
                      </span>
                      {getStateBadge(batch.state)}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      WO: <strong className="text-slate-300">{batch.workOrderId || 'N/A'}</strong> · Line: <strong className="text-slate-300">{batch.lineId || 'N/A'}</strong>
                    </p>
                  </div>

                  <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-blue-400 transition" />
                </div>

                {/* Progress bar info */}
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Current Station:</span>
                  <span className="font-bold text-blue-400">
                    {batch.currentStation ? `${batch.currentStation} (${batch.quantity} pcs)` : 'Not Started'}
                  </span>
                </div>

                {/* Indicators Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                  {batch.indicators.isBlocked && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center space-x-1 font-semibold">
                      <Ban className="w-3 h-3" />
                      <span>Blocked</span>
                    </span>
                  )}
                  {batch.indicators.isStale && (
                    <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 flex items-center space-x-1 font-semibold">
                      <Clock className="w-3 h-3" />
                      <span>Stale ({batch.dataFreshnessMinutes}m ago)</span>
                    </span>
                  )}
                  {batch.indicators.hasMissingData && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center space-x-1 font-semibold">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Missing Station Data</span>
                    </span>
                  )}
                  {batch.indicators.hasConflict && (
                    <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center space-x-1 font-semibold">
                      <ShieldAlert className="w-3 h-3" />
                      <span>Observation Conflict</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Batch Detail Modal */}
      <BatchDetailModal
        batch={selectedBatch}
        isOpen={!!selectedBatch}
        onClose={() => setSelectedBatch(null)}
        onUpdated={(freshBatch) => {
          if (freshBatch) setSelectedBatch(freshBatch);
          loadData(false);
        }}
      />
    </div>
  );
}

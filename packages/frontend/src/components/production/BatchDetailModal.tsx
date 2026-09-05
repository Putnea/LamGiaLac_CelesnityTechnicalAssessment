'use client';

import { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Ban,
  Play,
  FileText,
  CheckCheck,
  Layers,
  ArrowRight,
  MessageSquare,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  api,
  BatchView,
  BatchState,
  ManagementEvent,
  ManagementEventType,
  CanonicalEventStatus,
  STATION_ORDER,
} from '../../lib/api';

interface BatchDetailModalProps {
  batch: BatchView | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: (updatedBatch?: BatchView) => void;
}

export function BatchDetailModal({ batch, isOpen, onClose, onUpdated }: BatchDetailModalProps) {
  const [currentBatch, setCurrentBatch] = useState<BatchView | null>(batch);
  const [managementEvents, setManagementEvents] = useState<ManagementEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [actorName, setActorName] = useState('manager-1');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    setCurrentBatch(batch);
  }, [batch]);

  useEffect(() => {
    if (!isOpen || !currentBatch) return;
    setActionSuccess(null);
    setActionNote('');
    setLoadingEvents(true);
    api.getBatchManagementEvents(currentBatch.batchId)
      .then((events) => {
        setManagementEvents(events);
        setLoadingEvents(false);
      })
      .catch(() => setLoadingEvents(false));
  }, [isOpen, currentBatch?.batchId]);

  async function handleManagementAction(eventType: ManagementEventType) {
    if (!currentBatch) return;
    setIsSubmittingAction(true);
    setActionSuccess(null);

    // Optimistically update currentBatch state immediately for 0ms UI feedback
    if (eventType === ManagementEventType.BLOCK) {
      setCurrentBatch((prev) =>
        prev
          ? {
              ...prev,
              state: BatchState.BLOCKED,
              indicators: { ...prev.indicators, isBlocked: true },
            }
          : null
      );
    } else if (eventType === ManagementEventType.RESUME) {
      setCurrentBatch((prev) =>
        prev
          ? {
              ...prev,
              state: BatchState.IN_PROGRESS,
              indicators: { ...prev.indicators, isBlocked: false },
            }
          : null
      );
    }

    try {
      await api.createManagementEvent({
        batchId: currentBatch.batchId,
        eventType,
        actor: actorName || 'manager-1',
        note: actionNote || undefined,
      });
      setActionSuccess(`Successfully recorded ${eventType} event.`);
      setActionNote('');
      const [updatedEvents, freshBatch] = await Promise.all([
        api.getBatchManagementEvents(currentBatch.batchId),
        api.getBatchDetails(currentBatch.batchId),
      ]);
      setManagementEvents(updatedEvents);
      setCurrentBatch(freshBatch);
      onUpdated?.(freshBatch);
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setIsSubmittingAction(false);
    }
  }

  function getStateBadge(state: BatchState) {
    switch (state) {
      case BatchState.COMPLETED:
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">COMPLETED</span>;
      case BatchState.BLOCKED:
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">BLOCKED</span>;
      case BatchState.IN_PROGRESS:
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">IN PROGRESS</span>;
      case BatchState.PLANNED:
        return <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-500/15 text-slate-400 border border-slate-500/30">PLANNED</span>;
    }
  }

  if (!isOpen || !currentBatch) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-950/60 border border-blue-800/40">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-100">{currentBatch.batchId}</h2>
                {getStateBadge(currentBatch.state)}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Work Order: <strong className="text-slate-300">{currentBatch.workOrderId || 'N/A'}</strong> · Line: <strong className="text-slate-300">{currentBatch.lineId || 'N/A'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Indicators Banner */}
          {(currentBatch.indicators.isStale || currentBatch.indicators.hasMissingData || currentBatch.indicators.hasConflict || currentBatch.indicators.isBlocked) && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active System Indicators</h4>
              <div className="flex flex-wrap gap-2">
                {currentBatch.indicators.isBlocked && (
                  <span className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <Ban className="w-3.5 h-3.5" />
                    <span>Manager Block Applied</span>
                  </span>
                )}
                {currentBatch.indicators.isStale && (
                  <span className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Stale Data ({currentBatch.dataFreshnessMinutes}m since last event)</span>
                  </span>
                )}
                {currentBatch.indicators.hasMissingData && (
                  <span className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Missing Station Data in Sequence</span>
                  </span>
                )}
                {currentBatch.indicators.hasConflict && (
                  <span className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Cross-Source Observation Conflict</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 6-Station Progress Visualization */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pipeline Progression</h4>
            <div className="grid grid-cols-6 gap-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800/80">
              {STATION_ORDER.map((station, idx) => {
                const isCurrent = currentBatch.currentStation === station;
                const isPassed = currentBatch.stationHistory.some(
                  (h) => h.stationCode === station && h.status === CanonicalEventStatus.ACCEPTED
                );

                return (
                  <div
                    key={station}
                    className={`p-2.5 rounded-lg border text-center transition-all ${
                      isCurrent
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-bold shadow-sm shadow-blue-500/20'
                        : isPassed
                        ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400'
                        : 'bg-slate-900/40 border-slate-800/60 text-slate-600'
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider">{idx + 1}. {station.slice(0, 4)}</div>
                    <div className="text-xs font-mono font-bold mt-1">
                      {isCurrent ? `${currentBatch.quantity} pcs` : isPassed ? '✓' : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chronological Station History (with Provenance) */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Chronological Observation History & Provenance
            </h4>
            {currentBatch.stationHistory.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-950 rounded-lg">No operational events recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {currentBatch.stationHistory.map((h, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-blue-400 w-24">{h.stationCode}</span>
                      <span className="text-slate-200 font-semibold">{h.quantity} pcs</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        h.status === CanonicalEventStatus.ACCEPTED
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : h.status === CanonicalEventStatus.DUPLICATE
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {h.status}
                      </span>
                    </div>

                    <div className="flex items-center space-x-4 text-slate-400 text-[11px]">
                      <span>Source: <strong className="text-cyan-400">{h.sourceType}</strong> ({h.sourceRecordId})</span>
                      <span>{new Date(h.eventTime).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Management Actions Section */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span>Management Actions & Notes</span>
              </h4>
              <span className="text-[11px] font-mono text-slate-500">Append-only event store</span>
            </div>

            {actionSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center space-x-2">
                <CheckCheck className="w-4 h-4" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {/* Note & Actor Input */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  placeholder="Add note or reason (e.g., 'Quality inspection hold on dryer line')"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Actor (e.g. manager-1)"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 font-mono"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {currentBatch.state === BatchState.BLOCKED || currentBatch.indicators.isBlocked ? (
                <button
                  type="button"
                  disabled={isSubmittingAction}
                  onClick={() => handleManagementAction(ManagementEventType.RESUME)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume Batch</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSubmittingAction || currentBatch.state === BatchState.COMPLETED}
                  onClick={() => handleManagementAction(ManagementEventType.BLOCK)}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm transition"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Block Batch</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSubmittingAction}
                onClick={() => handleManagementAction(ManagementEventType.ACKNOWLEDGE)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Acknowledge</span>
              </button>

              <button
                type="button"
                disabled={isSubmittingAction || !actionNote.trim()}
                onClick={() => handleManagementAction(ManagementEventType.NOTE)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span>Add Note</span>
              </button>
            </div>

            {/* Audit Trail of Management Events */}
            {managementEvents.length > 0 && (
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Management Event Log:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-xs">
                  {managementEvents.map((evt) => (
                    <div key={evt.id} className="p-2 rounded bg-slate-900 border border-slate-800/80 flex items-center justify-between text-[11px]">
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${
                          evt.eventType === ManagementEventType.BLOCK ? 'text-rose-400' :
                          evt.eventType === ManagementEventType.RESUME ? 'text-emerald-400' :
                          'text-blue-400'
                        }`}>
                          [{evt.eventType}]
                        </span>
                        <span className="text-slate-300">{evt.note || 'No note'}</span>
                      </div>
                      <span className="text-slate-500">
                        {evt.actor} · {new Date(evt.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

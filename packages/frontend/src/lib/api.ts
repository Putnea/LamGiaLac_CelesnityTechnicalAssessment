/**
 * Frontend API client for Celesnity Factory Data Platform
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export enum SourceType {
  API = 'API',
  CRAWLER = 'CRAWLER',
  DATABASE = 'DATABASE',
  MQTT = 'MQTT',
}

export enum StationCode {
  RECEIVING = 'RECEIVING',
  SORTING = 'SORTING',
  WASHING = 'WASHING',
  DRYING = 'DRYING',
  FOLDING = 'FOLDING',
  DISPATCH = 'DISPATCH',
}

export const STATION_ORDER: StationCode[] = [
  StationCode.RECEIVING,
  StationCode.SORTING,
  StationCode.WASHING,
  StationCode.DRYING,
  StationCode.FOLDING,
  StationCode.DISPATCH,
];

export enum CollectionStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export enum CanonicalEventStatus {
  ACCEPTED = 'ACCEPTED',
  DUPLICATE = 'DUPLICATE',
  CONFLICT = 'CONFLICT',
}

export enum BatchState {
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  IN_PROGRESS = 'IN_PROGRESS',
  PLANNED = 'PLANNED',
}

export enum ManagementEventType {
  ACKNOWLEDGE = 'ACKNOWLEDGE',
  BLOCK = 'BLOCK',
  RESUME = 'RESUME',
  NOTE = 'NOTE',
}

export interface DataSource {
  id: string;
  name: string;
  type: SourceType;
  config: Record<string, any> | null;
  selectedTarget: string | null;
  isActive: boolean;
  lastCollectedAt: string | null;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionError {
  timestamp: string;
  message: string;
  context?: string;
}

export interface CollectionRun {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  status: CollectionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  recordsCollected: number;
  recordsFailed: number;
  errors: CollectionError[];
  createdAt: string;
}

export interface CanonicalEvent {
  id: string;
  batchId: string;
  workOrderId: string | null;
  lineId: string | null;
  stationCode: StationCode;
  quantity: number;
  eventTime: string;
  sourceType: SourceType;
  sourceRecordId: string;
  collectionRunId: string | null;
  status: CanonicalEventStatus;
  rawPayload: Record<string, any>;
  createdAt: string;
}

export interface StationHistoryEntry {
  stationCode: StationCode;
  quantity: number;
  eventTime: string;
  sourceType: SourceType;
  sourceRecordId: string;
  status: CanonicalEventStatus;
  collectionRunId: string | null;
}

export interface BatchIndicators {
  isStale: boolean;
  hasMissingData: boolean;
  hasConflict: boolean;
  isBlocked: boolean;
}

export interface BatchView {
  batchId: string;
  workOrderId: string | null;
  lineId: string | null;
  state: BatchState;
  currentStation: StationCode | null;
  quantity: number;
  lastEventTime: string | null;
  dataFreshnessMinutes: number | null;
  indicators: BatchIndicators;
  stationHistory: StationHistoryEntry[];
}

export interface StationSummary {
  stationCode: StationCode;
  wip: number;
  completedQuantity: number;
  lastEventTime: string | null;
  dataFreshnessMinutes: number | null;
  isStale: boolean;
}

export interface LineSummary {
  lineId: string;
  stations: StationSummary[];
  totalBatches: number;
  completedBatches: number;
  inProgressBatches: number;
  blockedBatches: number;
  plannedBatches: number;
  staleBatches: number;
}

export interface ProductionLineView {
  lineId: string;
  stations: StationSummary[];
  batches: BatchView[];
  summary: {
    totalBatches: number;
    completedBatches: number;
    inProgressBatches: number;
    blockedBatches: number;
    plannedBatches: number;
    staleBatches: number;
  };
}

export interface ManagementEvent {
  id: string;
  batchId: string;
  eventType: ManagementEventType;
  actor: string;
  organizationId: string;
  note: string | null;
  createdAt: string;
}

export interface SchemaDiscoveryResult {
  endpoints?: { path: string; description: string; fields: string[] }[];
  tables?: { name: string; columns: { name: string; type: string; nullable: boolean }[] }[];
  fields?: string[];
  message?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers, cache: 'no-store' });
  if (!res.ok) {
    let errMessage = `HTTP error ${res.status}`;
    try {
      const errData = await res.json();
      if (Array.isArray(errData.message)) {
        errMessage = errData.message.join(', ');
      } else if (typeof errData.message === 'string') {
        errMessage = errData.message;
      } else if (errData.error) {
        errMessage = errData.error;
      }
    } catch {
      // ignore
    }
    throw new Error(errMessage);
  }

  if (res.status === 204) {
    return null as any;
  }
  return res.json();
}

export const api = {
  // ── Sources ────────────────────────────────────────────────────────────────
  getSources: () => request<DataSource[]>('/sources'),
  getSource: (id: string) => request<DataSource>(`/sources/${id}`),
  createSource: (dto: {
    name: string;
    type: SourceType;
    config: Record<string, any>;
    credentials?: { password?: string; token?: string };
    selectedTarget?: string;
  }) => request<DataSource>('/sources', { method: 'POST', body: JSON.stringify(dto) }),
  updateSource: (id: string, dto: {
    name?: string;
    config?: Record<string, any>;
    credentials?: { password?: string; token?: string };
    selectedTarget?: string;
    isActive?: boolean;
  }) => request<DataSource>(`/sources/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  deleteSource: (id: string) => request<void>(`/sources/${id}`, { method: 'DELETE' }),
  testSource: (id: string) => request<{ success: boolean; message: string }>(`/sources/${id}/test`, { method: 'POST' }),
  discoverSchema: (id: string) => request<SchemaDiscoveryResult>(`/sources/${id}/schema`),

  // ── Collection & Streaming ────────────────────────────────────────────────
  triggerCollection: (sourceId: string) => request<CollectionRun>(`/sources/${sourceId}/collect`, { method: 'POST' }),
  startMqttStream: (sourceId: string) =>
    request<{ isStreaming: boolean; message: string }>(`/sources/${sourceId}/start-stream`, { method: 'POST' }),
  stopMqttStream: (sourceId: string) =>
    request<{ isStreaming: boolean; message: string }>(`/sources/${sourceId}/stop-stream`, { method: 'POST' }),
  getMqttStatus: () =>
    request<{ enabled: boolean; isStreaming: boolean; connected: boolean; brokerUrl: string }>(`/sources/mqtt/status`),
  getSourceRuns: (sourceId: string, page = 1, limit = 20) =>
    request<{ data: CollectionRun[]; total: number; page: number; limit: number }>(`/sources/${sourceId}/runs?page=${page}&limit=${limit}`),
  getAllRuns: (page = 1, limit = 20) =>
    request<{ data: CollectionRun[]; total: number; page: number; limit: number }>(`/runs?page=${page}&limit=${limit}`),
  getRun: (runId: string) => request<CollectionRun>(`/runs/${runId}`),

  // ── Normalized Events ──────────────────────────────────────────────────────
  getEvents: (page = 1, limit = 50, batchId?: string) =>
    request<{ data: CanonicalEvent[]; total: number; page: number; limit: number }>(
      `/events?page=${page}&limit=${limit}${batchId ? `&batchId=${batchId}` : ''}`
    ),
  softDeleteAllEvents: () =>
    request<{ affected: number }>('/events/soft-delete-all', { method: 'POST' }),
  restoreAllEvents: () =>
    request<{ affected: number }>('/events/restore-all', { method: 'POST' }),
  purgeAllEvents: () =>
    request<{ affected: number }>('/events/purge-all', { method: 'POST' }),
  getEventStats: () =>
    request<{ active: number; softDeleted: number; total: number }>('/events/stats'),

  // ── Production ─────────────────────────────────────────────────────────────
  getLines: () => request<LineSummary[]>('/production/lines'),
  getLineDetails: (lineId: string) => request<ProductionLineView>(`/production/lines/${lineId}`),
  getAllBatches: () => request<BatchView[]>('/production/batches'),
  getBatchDetails: (batchId: string) => request<BatchView>(`/production/batches/${batchId}`),

  // ── Management Events ──────────────────────────────────────────────────────
  createManagementEvent: (dto: {
    batchId: string;
    eventType: ManagementEventType;
    actor?: string;
    note?: string;
  }) => request<ManagementEvent>('/management/events', { method: 'POST', body: JSON.stringify(dto) }),
  getBatchManagementEvents: (batchId: string) => request<ManagementEvent[]>(`/management/batches/${batchId}/events`),
};

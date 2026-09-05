import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// ── Types & Interfaces ────────────────────────────────────────────────────────

export interface WorkOrder {
  id: string;
  lineId: string;
  description: string;
  createdAt: string;
}

export interface Batch {
  id: string;
  workOrderId: string;
  lineId: string;
  plannedQuantity: number;
}

export interface ReceivingRecord {
  id: string;
  batchId: string;
  supplierId: string;
  quantity: number;
  receivedAt: string;
  sourceRecordId: string;
}

export interface DispatchRecord {
  id: string;
  batchId: string;
  quantity: number;
  dispatchedAt: string;
  destination: string;
  sourceRecordId: string;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

// ── Master Data ───────────────────────────────────────────────────────────────

const WORK_ORDERS: WorkOrder[] = [
  { id: 'WO-001', lineId: 'LINE-A', description: 'Hotel Linen Batch — Morning Run', createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'WO-002', lineId: 'LINE-B', description: 'Hotel Linen Batch — Afternoon Run', createdAt: '2026-09-01T04:00:00.000Z' },
  { id: 'WO-003', lineId: 'LINE-A', description: 'Hotel Linen Batch — Evening Run', createdAt: '2026-09-01T08:00:00.000Z' },
];

const BATCHES: Batch[] = [
  { id: 'BATCH-001', workOrderId: 'WO-001', lineId: 'LINE-A', plannedQuantity: 120 },
  { id: 'BATCH-002', workOrderId: 'WO-001', lineId: 'LINE-A', plannedQuantity: 80 },
  { id: 'BATCH-003', workOrderId: 'WO-002', lineId: 'LINE-B', plannedQuantity: 60 },
  { id: 'BATCH-004', workOrderId: 'WO-002', lineId: 'LINE-B', plannedQuantity: 100 },
  { id: 'BATCH-005', workOrderId: 'WO-003', lineId: 'LINE-A', plannedQuantity: 90 },
  { id: 'BATCH-006', workOrderId: 'WO-003', lineId: 'LINE-A', plannedQuantity: 75 },
  { id: 'BATCH-007', workOrderId: 'WO-003', lineId: 'LINE-A', plannedQuantity: 50 },
  { id: 'BATCH-008', workOrderId: 'WO-002', lineId: 'LINE-B', plannedQuantity: 200 }, // PLANNED — no events anywhere
];

// Receiving records — covers STEP 1
const RECEIVING_RECORDS: ReceivingRecord[] = [
  { id: 'RCV-001', batchId: 'BATCH-001', supplierId: 'SUP-LINEN-CO', quantity: 120, receivedAt: '2026-09-01T00:05:00.000Z', sourceRecordId: 'API-RCV-001' },
  { id: 'RCV-002', batchId: 'BATCH-002', supplierId: 'SUP-LINEN-CO', quantity: 80,  receivedAt: '2026-09-01T00:08:00.000Z', sourceRecordId: 'API-RCV-002' },
  { id: 'RCV-003', batchId: 'BATCH-003', supplierId: 'SUP-FRESH-LIN', quantity: 60, receivedAt: '2026-09-01T04:05:00.000Z', sourceRecordId: 'API-RCV-003' },
  { id: 'RCV-004', batchId: 'BATCH-004', supplierId: 'SUP-FRESH-LIN', quantity: 100,receivedAt: '2026-09-01T04:10:00.000Z', sourceRecordId: 'API-RCV-004' },
  { id: 'RCV-005', batchId: 'BATCH-005', supplierId: 'SUP-LINEN-CO', quantity: 90,  receivedAt: '2026-09-01T08:05:00.000Z', sourceRecordId: 'API-RCV-005' },
  { id: 'RCV-006', batchId: 'BATCH-006', supplierId: 'SUP-LINEN-CO', quantity: 75,  receivedAt: '2026-09-01T08:10:00.000Z', sourceRecordId: 'API-RCV-006' },
  { id: 'RCV-007', batchId: 'BATCH-007', supplierId: 'SUP-LINEN-CO', quantity: 50,  receivedAt: '2026-09-01T08:15:00.000Z', sourceRecordId: 'API-RCV-007' },
  { id: 'RCV-008', batchId: 'BATCH-008', supplierId: 'SUP-FRESH-LIN', quantity: 200,receivedAt: '2026-09-01T04:15:00.000Z', sourceRecordId: 'API-RCV-008' },
];

// Dispatch records — covers STEP 6 (source: Application API)
const DISPATCH_RECORDS: DispatchRecord[] = [
  { id: 'DSP-001', batchId: 'BATCH-001', quantity: 118, dispatchedAt: '2026-09-01T12:00:00.000Z', destination: 'Grand Hotel', sourceRecordId: 'API-DSP-001' },
  { id: 'DSP-002', batchId: 'BATCH-002', quantity: 80,  dispatchedAt: '2026-09-01T12:30:00.000Z', destination: 'Grand Hotel', sourceRecordId: 'API-DSP-002' },
  { id: 'DSP-003', batchId: 'BATCH-003', quantity: 60,  dispatchedAt: '2026-09-01T13:00:00.000Z', destination: 'Riverside Inn', sourceRecordId: 'API-DSP-003' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function paginate<T extends { id: string }>(
  items: T[],
  cursor?: string,
  limit?: string | number
): PaginatedResult<T> {
  const safeLimit = Math.min(Math.max(typeof limit === 'number' ? limit : parseInt(limit || '5', 10) || 5, 1), 50);
  const startIdx = cursor ? items.findIndex((i) => i.id === cursor) + 1 : 0;
  if (startIdx < 0) return { data: [], nextCursor: null, total: items.length };
  const slice = items.slice(startIdx, startIdx + safeLimit);
  const nextCursor = startIdx + safeLimit < items.length ? slice[slice.length - 1].id : null;
  return { data: slice, nextCursor, total: items.length };
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'fixture-api', language: 'typescript' });
});

// Work orders (paginated)
app.get('/work-orders', (req: Request, res: Response) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit as string | undefined;
  const result = paginate(WORK_ORDERS, cursor, limit);
  res.json(result);
});

// Single work order
app.get('/work-orders/:id', (req: Request, res: Response) => {
  const wo = WORK_ORDERS.find((w) => w.id === req.params.id);
  if (!wo) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(wo);
});

// Batches (paginated, optional ?workOrderId= filter)
app.get('/batches', (req: Request, res: Response) => {
  let items = BATCHES;
  const workOrderId = req.query.workOrderId as string | undefined;
  if (workOrderId) {
    items = items.filter((b) => b.workOrderId === workOrderId);
  }
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit as string | undefined;
  const result = paginate(items, cursor, limit);
  res.json(result);
});

// Receiving records (paginated, optional ?batchId= filter)
app.get('/receiving', (req: Request, res: Response) => {
  let items = RECEIVING_RECORDS;
  const batchId = req.query.batchId as string | undefined;
  if (batchId) {
    items = items.filter((r) => r.batchId === batchId);
  }
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit as string | undefined;
  const result = paginate(items, cursor, limit);
  res.json(result);
});

// Dispatch records (paginated, optional ?batchId= filter)
app.get('/dispatch', (req: Request, res: Response) => {
  let items = DISPATCH_RECORDS;
  const batchId = req.query.batchId as string | undefined;
  if (batchId) {
    items = items.filter((d) => d.batchId === batchId);
  }
  const cursor = req.query.cursor as string | undefined;
  const limit = req.query.limit as string | undefined;
  const result = paginate(items, cursor, limit);
  res.json(result);
});

// Available endpoints (used by schema discovery)
app.get('/schema', (_req: Request, res: Response) => {
  res.json({
    endpoints: [
      { path: '/work-orders', description: 'Work orders master data', fields: ['id', 'lineId', 'description', 'createdAt'] },
      { path: '/batches',     description: 'Batch records',          fields: ['id', 'workOrderId', 'lineId', 'plannedQuantity'] },
      { path: '/receiving',   description: 'Receiving (step 1)',     fields: ['id', 'batchId', 'supplierId', 'quantity', 'receivedAt', 'sourceRecordId'] },
      { path: '/dispatch',    description: 'Dispatch (step 6)',      fields: ['id', 'batchId', 'quantity', 'dispatchedAt', 'destination', 'sourceRecordId'] },
    ],
  });
});

app.listen(PORT, () => {
  console.log(`[fixture-api] (TypeScript) Listening on port ${PORT}`);
});

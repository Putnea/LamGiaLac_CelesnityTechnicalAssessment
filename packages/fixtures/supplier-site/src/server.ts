import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

export interface DeliveryRecord {
  sourceRecordId: string;
  deliveryNumber: string;
  supplier: string;
  batchId: string;
  quantity: number;
  deliveryTime: string;
  malformed?: boolean;
}

// All delivery records — covers RECEIVING for all 8 batches
const ALL_DELIVERIES: DeliveryRecord[] = [
  { sourceRecordId: 'SUP-DEL-001', deliveryNumber: 'DLV-20260901-001', supplier: 'Linen Co. Vietnam', batchId: 'BATCH-001', quantity: 120, deliveryTime: '2026-09-01 00:00' },
  { sourceRecordId: 'SUP-DEL-002', deliveryNumber: 'DLV-20260901-002', supplier: 'Linen Co. Vietnam', batchId: 'BATCH-002', quantity: 80,  deliveryTime: '2026-09-01 00:05' },
  { sourceRecordId: 'SUP-DEL-003', deliveryNumber: 'DLV-20260901-003', supplier: 'Fresh Linen Ltd',   batchId: 'BATCH-003', quantity: 60,  deliveryTime: '2026-09-01 04:00' },
  { sourceRecordId: 'SUP-DEL-004', deliveryNumber: 'DLV-20260901-004', supplier: 'Fresh Linen Ltd',   batchId: 'BATCH-004', quantity: 100, deliveryTime: '2026-09-01 04:05' },
  // MALFORMED ROW — missing batchId, crawler must report and skip
  { sourceRecordId: 'SUP-DEL-BAD', deliveryNumber: 'DLV-20260901-BAD', supplier: 'Unknown',           batchId: '',          quantity: 0,   deliveryTime: '2026-09-01 04:30', malformed: true },
  { sourceRecordId: 'SUP-DEL-005', deliveryNumber: 'DLV-20260901-005', supplier: 'Linen Co. Vietnam', batchId: 'BATCH-005', quantity: 90,  deliveryTime: '2026-09-01 08:00' },
  { sourceRecordId: 'SUP-DEL-006', deliveryNumber: 'DLV-20260901-006', supplier: 'Linen Co. Vietnam', batchId: 'BATCH-006', quantity: 75,  deliveryTime: '2026-09-01 08:05' },
  { sourceRecordId: 'SUP-DEL-007', deliveryNumber: 'DLV-20260901-007', supplier: 'Linen Co. Vietnam', batchId: 'BATCH-007', quantity: 50,  deliveryTime: '2026-09-01 08:10' },
  { sourceRecordId: 'SUP-DEL-008', deliveryNumber: 'DLV-20260901-008', supplier: 'Fresh Linen Ltd',   batchId: 'BATCH-008', quantity: 200, deliveryTime: '2026-09-01 04:10' },
];

const PAGE_SIZE = 4; // small pages to force pagination

function renderPage(records: DeliveryRecord[], page: number, totalPages: number): string {
  const prevLink = page > 1
    ? `<a href="/deliveries?page=${page - 1}" id="prev-page">← Previous</a>`
    : '<span id="prev-page" aria-disabled="true">← Previous</span>';
  const nextLink = page < totalPages
    ? `<a href="/deliveries?page=${page + 1}" id="next-page">Next →</a>`
    : '<span id="next-page" aria-disabled="true">Next →</span>';

  const rows = records.map((r) => {
    if (r.malformed) {
      // Intentionally malformed — missing batchId cell, data-id present
      return `    <tr data-id="${r.sourceRecordId}" class="malformed-row">
      <td>${r.deliveryNumber}</td>
      <td>${r.supplier}</td>
      <td><!-- MISSING --></td>
      <td>${r.quantity}</td>
      <td>${r.deliveryTime}</td>
    </tr>`;
    }
    return `    <tr data-id="${r.sourceRecordId}">
      <td>${r.deliveryNumber}</td>
      <td>${r.supplier}</td>
      <td>${r.batchId}</td>
      <td>${r.quantity}</td>
      <td>${r.deliveryTime}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Supplier Delivery Portal — Page ${page}</title>
</head>
<body>
  <h1>Delivery Records</h1>
  <p>Page ${page} of ${totalPages} | Showing ${records.length} records</p>
  <table id="delivery-table" border="1" cellpadding="4">
    <thead>
      <tr>
        <th>Delivery Number</th>
        <th>Supplier</th>
        <th>Batch ID</th>
        <th>Quantity</th>
        <th>Delivery Time</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <nav id="pagination">
    ${prevLink}
    <span>Page ${page} / ${totalPages}</span>
    ${nextLink}
  </nav>
</body>
</html>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'fixture-supplier', language: 'typescript' });
});

app.get('/deliveries', (req: Request, res: Response) => {
  const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
  const totalPages = Math.ceil(ALL_DELIVERIES.length / PAGE_SIZE);

  if (page > totalPages) {
    res.send(renderPage([], page, totalPages));
    return;
  }

  const start = (page - 1) * PAGE_SIZE;
  const records = ALL_DELIVERIES.slice(start, start + PAGE_SIZE);
  res.send(renderPage(records, page, totalPages));
});

// Landing page — redirect to deliveries
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/deliveries?page=1');
});

app.listen(PORT, () => {
  console.log(`[fixture-supplier] (TypeScript) Listening on port ${PORT}`);
});

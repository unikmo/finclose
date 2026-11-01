// Builds a small text-only PDF for tests: each text item is placed at an exact position, the way a
// bank's statement generator places table cells. Helvetica is a standard font, so nothing is embedded.
export type PdfText = { x: number; y: number; text: string; size?: number };

export function makeTextPdf(pages: PdfText[][], extraObjects: string[] = []): Buffer {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids: number[] = [];
  for (const items of pages) {
    const stream = items.map(i => `BT /F1 ${i.size || 9} Tf ${i.x} ${i.y} Td (${i.text.replace(/([\\()])/g, '\\$1')}) Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  for (const extra of extraObjects) add(extra);
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(out)); out += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// A statement laid out as a table: optional header row, then one row per transaction.
export function statementPdf(rows: string[][], columnsX: number[], startY = 760, step = 14, headers?: string[]): Buffer {
  const items: PdfText[] = [];
  let y = startY;
  items.push({ x: 50, y: y + 30, text: 'Example Bank statement' });
  if (headers) { headers.forEach((h, i) => items.push({ x: columnsX[i], y, text: h })); y -= step; }
  for (const row of rows) { row.forEach((cell, i) => { if (cell) items.push({ x: columnsX[i], y, text: cell }); }); y -= step; }
  return makeTextPdf([items]);
}

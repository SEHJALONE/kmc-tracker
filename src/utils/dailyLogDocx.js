import JSZip from 'jszip';
import { averageActual, formDate } from './dailyLogModel.js';

// ── DPN Operations Daily Log → Word ──────────────────────────────────────
// Fills the controlled template itself (public/templates/
// DPN_Operations_Daily_Log_Template.docx) rather than drawing a look-alike,
// so the header, logo, form number, footer legend, fonts and borders are
// exactly the issued form's. Only the empty cells are written into.
//
// The template's body is four tables:
//   0  Division | · | Unit | ·          /  Date | · | Start Time | · | Finishing Time | ·
//   1  SN | Tasks | Planned | Actual | Downtime (hours) | Reason Code | Remarks, + 6 blank rows
//   2  Other Downtime Reason | ·        /  Supervisor's Comment | Score  /  · | ·
//   3  · | Name | Designation | Signature  /  Operator's …  /  Supervisor's …
// SN is a Word auto-numbered list, so it is never written: extra task rows
// are cloned from a blank one and number themselves.

export const TEMPLATE_URL = '/templates/DPN_Operations_Daily_Log_Template.docx';
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const BLANK_TASK_ROWS = 6;

const kids = (el, name) => Array.from(el.childNodes).filter(n => n.namespaceURI === W && n.localName === name);

// Replaces a cell's text, keeping its paragraph formatting. The run takes the
// paragraph mark's own run properties, which is how the template styles each
// cell (font, size, bold).
function setCell(doc, tc, value) {
  const text = value == null ? '' : String(value);
  const [p, ...extra] = kids(tc, 'p');
  extra.forEach(x => tc.removeChild(x));
  Array.from(p.childNodes).forEach(n => { if (!(n.namespaceURI === W && n.localName === 'pPr')) p.removeChild(n); });
  if (!text) return;
  const markRPr = kids(p, 'pPr')[0] && kids(kids(p, 'pPr')[0], 'rPr')[0];
  text.split('\n').forEach((line, i) => {
    const r = doc.createElementNS(W, 'w:r');
    if (markRPr) r.appendChild(markRPr.cloneNode(true));
    if (i > 0) r.appendChild(doc.createElementNS(W, 'w:br'));
    const t = doc.createElementNS(W, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = line;
    r.appendChild(t);
    p.appendChild(r);
  });
}

// Word keys revision tracking on w14:paraId; a cloned row must not repeat them.
function stripParaIds(el) {
  [el, ...el.getElementsByTagName('*')].forEach(n => {
    n.removeAttributeNS?.(W14, 'paraId');
    n.removeAttributeNS?.(W14, 'textId');
  });
}

const pct = v => (v === '' || v == null ? '' : `${v}%`);
const hrs = v => (v === '' || v == null || Number(v) === 0 ? '' : String(v));

// log = buildDailyLog() output, as edited in the dialog. template = the .docx
// as an ArrayBuffer/Uint8Array. Resolves with the filled document (type is
// any JSZip output type: 'blob' in the browser, 'uint8array' in tests).
export async function fillDailyLogDocx(template, log, type = 'blob') {
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const tables = kids(body, 'tbl');
  if (tables.length < 4) throw new Error('This is not the DPN Operations Daily Log template.');
  const rows = t => kids(t, 'tr');
  const cell = (t, r, c) => kids(rows(t).at(r), 'tc').at(c);

  // Table 0 — Division, Unit, Date, times.
  const [head, activities, notes, signoff] = tables;
  setCell(doc, cell(head, 0, 1), log.division);
  setCell(doc, cell(head, 0, 3), log.unit);
  setCell(doc, cell(head, 1, 1), formDate(log.date));
  setCell(doc, cell(head, 1, 3), log.startTime);
  setCell(doc, cell(head, 1, 5), log.finishTime);

  // Table 1 — one row per task; the form's 6 blank rows stay when fewer.
  const tasks = (log.tasks || []).filter(t => String(t.task || '').trim());
  const blank = rows(activities).at(-1);
  for (let i = BLANK_TASK_ROWS; i < tasks.length; i++) {
    const clone = blank.cloneNode(true);
    stripParaIds(clone);
    activities.appendChild(clone);
  }
  tasks.forEach((t, i) => {
    const c = col => cell(activities, i + 1, col);
    setCell(doc, c(1), t.task);
    setCell(doc, c(2), pct(t.planned));
    setCell(doc, c(3), pct(t.actual));
    setCell(doc, c(4), hrs(t.downtime));
    setCell(doc, c(5), t.reason);
    setCell(doc, c(6), t.remarks);
  });

  // Table 2 — other reason, supervisor's comment, score.
  setCell(doc, cell(notes, 0, 1), log.otherDowntimeReason);
  setCell(doc, cell(notes, 2, 0), log.supervisorComment);
  setCell(doc, cell(notes, 2, 1), pct(averageActual(tasks)));

  // Table 3 — sign-off.
  [log.operator, log.supervisor].forEach((who, i) => {
    setCell(doc, cell(signoff, i + 1, 1), who?.name);
    setCell(doc, cell(signoff, i + 1, 2), who?.designation);
    setCell(doc, cell(signoff, i + 1, 3), who?.signature);
  });

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type, mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

export function dailyLogFileName(log) {
  const unit = String(log.unit || 'Unit').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `DPN_Daily_Log_${unit}_${log.date}.docx`;
}

// Browser: fetch the template, fill it, and save the file.
export async function downloadDailyLogDocx(log) {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error('Could not load the Daily Log template.');
  const blob = await fillDailyLogDocx(await res.arrayBuffer(), log, 'blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dailyLogFileName(log);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

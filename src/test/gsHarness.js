import { createHash, createHmac, randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';

// Runs the REAL Apps Script files (the ones that get pasted into the editor)
// against an in-memory spreadsheet and fake Google services, so the script is
// tested as executed code rather than read. Mail sent through MailApp/GmailApp
// is recorded in `mail` instead of going anywhere.

const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((n, r) => Math.max(n, r.length), 0); }
  appendRow(r) { this.rows.push([...r]); return this; }
  getDataRange() { return { getValues: () => this.rows.map(r => [...r]) }; }
  getRange(r, c, nr = 1, nc = 1) {
    const self = this;
    const api = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (self.rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      getValue: () => (self.rows[r - 1] || [])[c - 1] ?? '',
      setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (self.rows[r - 1 + i] ||= [])[c - 1 + j] = x; })); return api; },
      setValue(x) { (self.rows[r - 1] ||= [])[c - 1] = x; return api; },
    };
    return new Proxy(api, { get: (t, k) => (k in t ? t[k] : noop) });
  }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  setFrozenRows() {} autoResizeColumns() {}
}

class Spreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.set(n, s); return s; }
}

export function loadScripts(sources, { aliases = [], quota = 100 } = {}) {
  const sheets = { tracker: new Spreadsheet(), priv: new Spreadsheet() };
  const trackerLog = sheets.tracker.insertSheet('Travel Card Data');
  trackerLog.appendRow(['Timestamp', 'VIN', 'Bus Model', 'Station Code', 'Designed Time (min)']);
  const cache = new Map();
  const props = new Map();
  const mail = [];
  const bytes = buf => [...buf].map(b => (b > 127 ? b - 256 : b));
  const toBuf = v => (Array.isArray(v) ? Buffer.from(v.map(b => b & 0xff)) : Buffer.from(String(v), 'utf8'));
  const blob = (arr, type, name) => ({ getDataAsString: () => toBuf(arr).toString('utf8'), getName: () => name, getContentType: () => type });
  const split = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const sandbox = {
    console, JSON, Date, Math, Object, Array, String, Number, Error, parseInt, parseFloat, isNaN,
    Logger: { log() {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: id => (id.startsWith('1TS2') ? sheets.priv : sheets.tracker) },
    Utilities: {
      Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => randomUUID(),
      computeDigest: (_alg, s) => bytes(createHash('sha256').update(String(s), 'utf8').digest()),
      computeHmacSha256Signature: (text, key) => bytes(createHmac('sha256', String(key)).update(String(text), 'utf8').digest()),
      base64EncodeWebSafe: v => toBuf(v).toString('base64url'),
      base64DecodeWebSafe: s => bytes(Buffer.from(String(s), 'base64url')),
      base64Decode: s => bytes(Buffer.from(String(s), 'base64')),
      newBlob: (arr, type, name) => blob(arr, type, name),
      formatDate: d => new Date(d).toISOString(),
      sleep() {},
    },
    MailApp: {
      getRemainingDailyQuota: () => quota,
      sendEmail: m => mail.push({ to: split(m.to), bcc: split(m.bcc), subject: m.subject, html: m.htmlBody, attachments: m.attachments || [] }),
    },
    GmailApp: {
      getAliases: () => aliases,
      sendEmail: (to, subject, _text, o) => mail.push({ to: split(to), bcc: split(o.bcc), subject, html: o.htmlBody, attachments: o.attachments || [], from: o.from }),
    },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => noop, deleteTrigger() {} },
    UrlFetchApp: { fetch: noop },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
  };
  runInNewContext(sources.join('\n;\n'), sandbox);
  const call = async params => JSON.parse(sandbox.doPost({ parameter: params }).getContent());
  return {
    sandbox, sheets, mail, call, cache,
    rows: name => (sheets.priv.getSheetByName(name) || sheets.tracker.getSheetByName(name))?.rows ?? [],
  };
}

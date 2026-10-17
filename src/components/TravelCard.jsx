const SHEETS_URL = "https://script.google.com/macros/s/AKfycbyHsyDOXkIURCTNrsxl4MbUVhqZxNco0qz1Bl95UePnesSQgnbJlfyIuiy7FkuAOH_q/exec";

const STATION_TIMES_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQaiOeH78PS8rtCQOTd38jCTioVCQRan3Bg4MJcPbNB87odrcmsL_qA3cEPdAzfTZsP11Dqr1aNA7OY/pub?gid=343120708&single=true&output=csv";

function parseStationTimes(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return {};
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const codeIdx = headers.findIndex(h => h.includes("station code") || h.includes("stationcode") || h === "code");
  const timeIdx = headers.findIndex(h => h.includes("estimated") || h.includes("time") || h.includes("min"));
  if (codeIdx === -1 || timeIdx === -1) return {};
  const result = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = []; let cur = ""; let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    const rawCode = cells[codeIdx]?.trim().toUpperCase().replace(/\s+/g, "-");
    const rawTime = cells[timeIdx]?.trim();
    if (!rawCode || !rawTime) continue;
    const mins = parseFloat(rawTime);
    if (isNaN(mins) || mins <= 0) continue;
    for (const code of rawCode.split("/").map(c => c.trim()).filter(Boolean)) {
      result[code] = mins;
    }
  }
  return result;
}

async function fetchStationTimes() {
  const res = await fetch(STATION_TIMES_URL + "&t=" + Date.now());
  if (!res.ok) throw new Error("HTTP " + res.status);
  const times = parseStationTimes(await res.text());
  return {
    times,
    getMinutes: (code) => {
      if (!code) return null;
      const norm = code.trim().toUpperCase().replace(/\s+/g, "-");
      if (times[norm] !== undefined) return times[norm];
      const key = Object.keys(times).find(k => k.split("/").map(s => s.trim()).includes(norm));
      return key ? times[key] : null;
    },
  };
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const SESSION_KEY = "kmc_travelcard_saved_session";
const LS = {
  get: (k, fallback = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Convert an ISO timestamp (UTC) to a value a datetime-local input accepts
// ("YYYY-MM-DDTHH:mm" in local time). Empty/invalid → "".
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("sv-SE").slice(0, 16).replace(" ", "T");
}

// ── Production schedule ─────────────────────────────────────────────────────
// Default shift is 08:00–18:00 (the user overrides this by entering their own
// clock-in / clock-out). Non-productive breaks are excluded from "time used".
const SCHEDULE = {
  shiftStart: "08:00",
  shiftEnd:   "18:00",
  breaks: [
    { start: "10:00", end: "10:30", label: "Tea break" },
    { start: "13:00", end: "14:00", label: "Lunch" },
  ],
};

// Net productive minutes between a local clock-in string and an ISO clock-out.
// Sundays and the part of Saturday outside 08:00–13:00 are not worked time, and
// scheduled breaks are excluded (see utils/workTime.js). Returns
// { gross, breaks, net } where gross is elapsed minutes and breaks is EVERYTHING
// excluded, so gross − breaks = net.
function productiveMinutes(clockInLocal, clockOutISO) {
  const start = new Date(clockInLocal);
  const end = new Date(new Date(clockOutISO).toLocaleString("sv-SE").replace(" ", "T"));
  if (isNaN(start) || isNaN(end)) return { gross: 0, breaks: 0, net: 0 };
  const w = workingMinutes(start, end);
  return { gross: w.gross, breaks: Math.max(0, w.gross - w.net), net: w.net };
}

// This device's own copy of the cards it filed per VIN — a fallback for the
// Full Bus Report while the sheet catches up. The evidence photo (base64,
// often megabytes) is left out: storing it used to fill the ~5 MB browser
// quota, after which every later save here failed silently.
function appendBusLog(vin, sub) {
  const key = `kmc_bus_log_${vin}`;
  const slim = sub.downtime ? { ...sub, downtime: { ...sub.downtime, attachmentB64: null } } : sub;
  LS.set(key, [...LS.get(key, []), slim].slice(-200));
}

import { useState, useEffect, useRef } from "react";
import { downloadStationReport, downloadBusReport } from '../export/travelCardReport';
import { busCardsFor, emailCardReports, describeCardEmail } from '../utils/cardEmail';
import { SEED_LINES, SEED_STATIONS } from '../data/stations';
import { useStationPresets, presetFor } from '../hooks/useStationPresets';
import { workingMinutes } from '../utils/workTime';
import { SIX, mergeConsumables, usedOtherRes, stationLabelForModel } from '../data/travelCardSeed';
import { resolveTcCatalog, modelKindOf } from '../utils/tcCatalog';
// Older imports read the seed from this file; keep them working.
export { TC_LINES, ACTS, RES, LINE_MODELS, STATION_MODELS, mergeConsumables, usedOtherRes, stationLabelForModel } from '../data/travelCardSeed';
import { useStationConsumables } from '../hooks/useStationConsumables';

// ── Theme ─────────────────────────────────────────────────────────────────────
const R = "#dc2626";
const RA = "rgba(220,38,38,0.12)";
const RB = "rgba(220,38,38,0.3)";
const GR = "#10b981";
const AM = "#f59e0b";

function makeTheme(isDark) {
  return isDark ? {
    bg:       "rgba(7,9,15,0.82)",
    card:     "rgba(13,21,38,0.88)",
    border:   "rgba(255,255,255,0.08)",
    borderHi: "rgba(255,255,255,0.16)",
    text:     "#e2e8f0",
    muted:    "#94a3b8",
    dim:      "#64748b",
    dimmer:   "#475569",
    fm:       "'Inter', system-ui, sans-serif",
    mono:     "'Inter', system-ui, sans-serif",
    topbar:   "rgba(7,9,15,0.90)",
    inpBg:    "#0d1526",
    inpBor:   "rgba(255,255,255,0.10)",
  } : {
    bg:       "rgba(255,255,255,0.88)",
    card:     "rgba(255,255,255,0.95)",
    border:   "rgba(0,0,0,0.09)",
    borderHi: "rgba(0,0,0,0.18)",
    text:     "#1e293b",
    muted:    "#475569",
    dim:      "#64748b",
    dimmer:   "#94a3b8",
    fm:       "'Inter', system-ui, sans-serif",
    mono:     "'Inter', system-ui, sans-serif",
    topbar:   "rgba(255,255,255,0.92)",
    inpBg:    "#f8fafc",
    inpBor:   "rgba(0,0,0,0.12)",
  };
}

// Placeholder — overridden inside component with theme-aware values
let T = makeTheme(true);
let INP_BG  = T.inpBg;
let INP_BOR = T.inpBor;
const INP_FOC = "rgba(220,38,38,0.45)";

const css = {
  wrap:    { maxWidth: 680, margin: "0 auto", padding: "0 0 100px", fontFamily: T.fm, fontSize: 14, color: T.text, background: T.bg, boxSizing: 'border-box' },
  topbar:  { display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${T.border}`, marginBottom: 20, background: T.topbar, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", position: "sticky", top: 0, zIndex: 10 },
  logo:    { height: 36, width: "auto", objectFit: "contain" },
  t1:      { fontSize: 17, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.text },
  t2:      { fontSize: 10, color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.06em", marginTop: 2 },
  segsWrap:{ display: "flex", gap: 3, marginBottom: 5, padding: "0 20px" },
  seg:     { flex: 1, height: 2, borderRadius: 1, background: T.border, transition: "background .3s" },
  segDone: { background: GR },
  segAct:  { background: R },
  lblsWrap:{ display: "flex", marginBottom: 22, padding: "0 20px" },
  lbl:     { flex: 1, fontSize: 9, textAlign: "center", color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" },
  lblAct:  { color: T.text, fontWeight: 600 },
  lblDone: { color: T.dim },
  card:    { border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px 20px", marginBottom: 14, background: T.card, margin: "0 20px 14px" },
  cardHd:  { fontSize: 9, fontWeight: 600, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: T.mono, marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid rgba(220,38,38,0.2)` },
  fld:     { marginBottom: 14 },
  lbl_:    { display: "block", fontSize: 10, color: T.muted, fontFamily: T.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 },
  inp:     { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: T.fm, colorScheme: "dark", transition: "border-color .15s" },
  ta:      { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", resize: "vertical", minHeight: 64, boxSizing: "border-box", fontFamily: T.fm, colorScheme: "dark" },
  g2:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tagRow:  { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 },
  tag:     { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 10px", borderRadius: 3, border: `1px solid rgba(220,38,38,0.3)`, background: "rgba(220,38,38,0.07)", color: "#fca5a5", fontFamily: T.mono },
  tagX:    { background: "none", border: "none", cursor: "pointer", color: "#fca5a5", fontSize: 14, lineHeight: 1, padding: "0 0 0 3px" },
  addRow:  { display: "flex", gap: 6, marginTop: 8 },
  addInp:  { flex: 1, fontSize: 12, padding: "7px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", fontFamily: T.fm, colorScheme: "dark" },
  addBtn:  { fontSize: 11, padding: "7px 13px", border: `1px solid ${RB}`, borderRadius: 4, background: "rgba(220,38,38,0.08)", color: R, cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.06em", flexShrink: 0, transition: "background .15s" },
  cbGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 },
  cbItem:  { display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, cursor: "pointer", color: T.muted },
  actRow:  { display: "grid", gridTemplateColumns: "1fr 140px", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` },
  actName: { fontSize: 12, color: T.muted, lineHeight: 1.4 },
  stSel:   { fontSize: 11, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 3, background: INP_BG, color: T.text, cursor: "pointer", width: "100%", fontFamily: T.mono, colorScheme: "dark" },
  resRow:  { display: "grid", gridTemplateColumns: "1fr 70px", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.border}` },
  resName: { fontSize: 12, color: T.muted },
  qty:     { width: 70, fontSize: 12, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, textAlign: "center", outline: "none", fontFamily: T.mono, colorScheme: "dark" },
  togWrap: { display: "flex", alignItems: "center", gap: 10 },
  banner:  { display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", borderRadius: 6, marginBottom: 14, background: "rgba(245,158,11,0.08)", border: `1px solid rgba(245,158,11,0.25)`, margin: "0 20px 14px" },
  stat3:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "0 20px 14px" },
  statC:   { borderRadius: 6, padding: 12, textAlign: "center", background: T.card, border: `1px solid ${T.border}` },
  statV:   { fontSize: 28, fontWeight: 700, letterSpacing: "0.04em" },
  statL:   { fontSize: 9, color: T.dimmer, fontFamily: T.mono, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.1em" },
  sixGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  mCard:   { border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 13px", cursor: "pointer", transition: "border-color .15s", background: "rgba(255,255,255,0.02)" },
  mCardSel:{ border: `1px solid ${R}`, background: RA },
  mTitle:  { fontSize: 13, fontWeight: 700, letterSpacing: "0.06em" },
  mSub:    { fontSize: 10, color: T.dim, marginTop: 3, fontFamily: T.mono },
  subSec:  { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` },
  subHd:   { fontSize: 9, color: T.dimmer, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 },
  pill:    { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "4px 12px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: GR, border: "1px solid rgba(16,185,129,0.25)", fontFamily: T.mono },
  confC:   { background: T.card, borderRadius: 6, padding: 16, margin: "0 20px 14px", border: `1px solid ${T.border}` },
  confRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, gap: 10 },
  confLbl: { color: T.dim, flexShrink: 0, fontFamily: T.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" },
  confVal: { fontWeight: 600, textAlign: "right", maxWidth: "60%", wordBreak: "break-word", color: T.text },
  btnP:    { width: "100%", padding: "11px 0", background: R, color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: T.fm },
  btnS:    { width: "100%", padding: "10px 0", background: "transparent", color: T.muted, border: `1px solid ${INP_BOR}`, borderRadius: 4, fontSize: 13, cursor: "pointer", marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fm },
  btnDl:   { width: "100%", padding: "10px 0", background: "rgba(16,185,129,0.1)", color: GR, border: "1px solid rgba(16,185,129,0.3)", borderRadius: 4, fontSize: 13, cursor: "pointer", marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fm, fontWeight: 700 },
  nav2:    { display: "flex", gap: 8, marginTop: 12, padding: "0 20px" },
  note:    { fontSize: 10, color: T.dimmer, fontFamily: T.mono, marginTop: 4 },
  evsBox:  { textAlign: "center", padding: "32px 16px" },
  px:      { padding: "0 20px" },
  statusOk:  { color: GR },
  statusWarn:{ color: AM },
  statusErr: { color: R },
};

function Inp({ label, hint, ...p }) {
  return (
    <div style={css.fld}>
      {label && <label style={css.lbl_}>{label}</label>}
      <input style={css.inp} {...p} />
      {hint && <div style={css.note}>{hint}</div>}
    </div>
  );
}
function Sel({ label, children, ...p }) {
  return (
    <div style={css.fld}>
      {label && <label style={css.lbl_}>{label}</label>}
      <select style={css.inp} {...p}>{children}</select>
    </div>
  );
}
function Tag({ label, onDel }) {
  return (
    <div style={css.tag}>
      {label}
      {onDel && <button style={css.tagX} onClick={onDel}>×</button>}
    </div>
  );
}
function AddRow({ placeholder, onAdd }) {
  const [v, setV] = useState("");
  return (
    <div style={css.addRow}>
      <input style={css.addInp} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
        onKeyDown={e => e.key === "Enter" && (onAdd(v), setV(""))} />
      <button style={css.addBtn} onClick={() => { onAdd(v); setV(""); }}>+ ADD</button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TravelCard({ prefillVin = "", prefillModel = "", prefillStation = "", lockedStation = null, lockedStations = null, currentUserName = null, onReset, onSubmitSuccess, theme = "dark", catalog = {}, role = "user", editSubmission = null, onEditSubmit = null, taskPrefill = null, onCardSubmitted = null, onExit = null }) {
  // Normalize single/multi station-lock props into one list. A single assigned
  // station keeps the old fully-locked (disabled dropdown) behavior; multiple
  // assigned stations (same line, e.g. a station head over several stations)
  // instead show an enabled dropdown restricted to just those stations.
  const lockedCodes = (lockedStations && lockedStations.length) ? lockedStations : (lockedStation ? [lockedStation] : []);
  const isMultiLocked = lockedCodes.length > 1;
  const isAdmin = role === "systemadmin" || role === "useradmin";
  const isSupervisor = role === "supervisor";
  const isUser = role === "user"; // plain user — 2 tabs only, no downtime/sign-off
  // Editing an already-submitted card (general user, still pre-approval) —
  // see MySubmissions.jsx. Patches the existing sheet row instead of
  // creating a new one; see submitUserCard below.
  const isEditMode = !!editSubmission;
  // Recompute theme tokens on every render so styles react to theme changes
  T = makeTheme(theme === 'dark');
  INP_BG  = T.inpBg;
  INP_BOR = T.inpBor;

  // Rebuild css after T is updated
  css.wrap    = { maxWidth: 680, margin: "0 auto", padding: "0 0 100px", fontFamily: T.fm, fontSize: 14, color: T.text, background: T.bg };
  css.topbar  = { display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${T.border}`, marginBottom: 20, background: T.topbar, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap" };
  css.t2      = { fontSize: 10, color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.06em", marginTop: 2 };
  css.lbl_    = { display: "block", fontSize: 10, color: T.muted, fontFamily: T.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 };
  css.inp     = { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", boxSizing: "border-box", fontFamily: T.fm, colorScheme: theme === 'dark' ? "dark" : "light", transition: "border-color .15s" };
  css.ta      = { width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", resize: "vertical", minHeight: 64, boxSizing: "border-box", fontFamily: T.fm, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.stSel   = { fontSize: 11, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 3, background: INP_BG, color: T.text, cursor: "pointer", width: "100%", fontFamily: T.mono, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.qty     = { width: 70, fontSize: 12, padding: "5px 8px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, textAlign: "center", outline: "none", fontFamily: T.mono, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.addInp  = { flex: 1, fontSize: 12, padding: "7px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, color: T.text, outline: "none", fontFamily: T.fm, colorScheme: theme === 'dark' ? "dark" : "light" };
  css.cbItem  = { display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px", border: `1px solid ${INP_BOR}`, borderRadius: 4, background: INP_BG, cursor: "pointer", color: T.muted };
  css.card    = { border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px 20px", marginBottom: 14, background: T.card, margin: "0 20px 14px" };
  css.actRow  = { display: "grid", gridTemplateColumns: "1fr 140px", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}` };
  css.actName = { fontSize: 12, color: T.muted, lineHeight: 1.4 };
  css.resRow  = { display: "grid", gridTemplateColumns: "1fr 70px", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.border}` };
  css.resName = { fontSize: 12, color: T.muted };
  css.statC   = { borderRadius: 6, padding: 12, textAlign: "center", background: T.card, border: `1px solid ${T.border}` };
  css.statL   = { fontSize: 9, color: T.dimmer, fontFamily: T.mono, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.1em" };
  css.confC   = { background: T.card, borderRadius: 6, padding: 16, margin: "0 20px 14px", border: `1px solid ${T.border}` };
  css.confRow = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12, gap: 10 };
  css.confLbl = { color: T.dim, flexShrink: 0, fontFamily: T.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" };
  css.confVal = { fontWeight: 600, textAlign: "right", maxWidth: "60%", wordBreak: "break-word", color: T.text };
  css.lbl     = { flex: 1, fontSize: 9, textAlign: "center", color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" };
  css.t1      = { fontSize: 17, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.text };
  css.lblAct  = { color: T.text, fontWeight: 600 };
  css.lbl     = { flex: 1, fontSize: 9, textAlign: "center", color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.08em", textTransform: "uppercase" };
  css.lblDone = { color: T.dim };
  css.subHd   = { fontSize: 9, color: T.dimmer, fontFamily: T.mono, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 };
  css.note    = { fontSize: 10, color: T.dimmer, fontFamily: T.mono, marginTop: 4 };
  css.mSub    = { fontSize: 10, color: T.dim, marginTop: 3, fontFamily: T.mono };
  css.seg     = { flex: 1, height: 2, borderRadius: 1, background: T.border, transition: "background .3s" };
  css.btnS    = { width: "100%", padding: "10px 0", background: "transparent", color: T.muted, border: `1px solid ${INP_BOR}`, borderRadius: 4, fontSize: 13, cursor: "pointer", marginTop: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fm };

  const [page, setPage] = useState(0);

  // Identity
  const [projects, setProjects] = useState(() => LS.get("kmc_projects", {}));
  const [curProj, setCurProj] = useState("");
  const [busModel, setBusModel] = useState(prefillModel);
  const [vin, setVin] = useState(prefillVin);
  const [curLine, setCurLine] = useState("");
  const [lockedStationOptions, setLockedStationOptions] = useState([]); // resolved "CODE: name" strings when multi-locked
  const [curCode, setCurCode] = useState(() => prefillStation ? prefillStation.split(":")[0].trim() : "");
  const [curSt, setCurSt] = useState(prefillStation);
  const [designedTime, setDesignedTime] = useState(0);

  // Staff (per station — pool is station-scoped, loaded dynamically in onStation)
  const [operators, setOperators] = useState([]);
  const [selOps, setSelOps] = useState([]);

  // Reviewers — global list, separate from station operators
  const [reviewers, setReviewers] = useState(() => LS.get("kmc_reviewers", []));
  const [hseCount, setHseCount] = useState("");

  // Activities
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState(""); // set automatically in p0next (change 4)
  const [actStatuses, setActStatuses] = useState({});
  const [otherActs, setOtherActs] = useState([]);   // ad-hoc activities added on the card
  const [otherActName, setOtherActName] = useState("");
  const [resQtys, setResQtys] = useState({});
  const [removedRes, setRemovedRes] = useState([]);
  const [otherRes, setOtherRes] = useState([]);
  const [otherResName, setOtherResName] = useState("");
  const [otherResQty, setOtherResQty] = useState("");
  const stationCons = useStationConsumables();
  const stationPresets = useStationPresets();
  const [ohs, setOhs] = useState(false);
  const [ohsTxt, setOhsTxt] = useState("");
  const [waste, setWaste] = useState("");

  // Downtime
  const [hasDowntime, setHasDowntime] = useState(false);
  const [actualTime, setActualTime] = useState(0);  // net productive minutes
  const [grossTime, setGrossTime]   = useState(0);  // elapsed clock-in→out
  const [breakTime, setBreakTime]   = useState(0);  // scheduled breaks excluded
  const [selMs, setSelMs] = useState([]);
  const [subCauses, setSubCauses] = useState({});
  const [causeTimes, setCauseTimes] = useState({});      // { causeName: minutes }
  const [customCauses, setCustomCauses] = useState([]);  // user-added causes beyond the 6M
  const [customCauseName, setCustomCauseName] = useState("");
  const [corrAction, setCorrAction] = useState("");
  const [orComments, setOrComments] = useState("");

  // General-user optional pre-submit fields (kept separate from the
  // supervisor-only downtime/RCA flow above, which plain users never see).
  const [genComments, setGenComments] = useState("");
  const [delayTypes, setDelayTypes] = useState([]);       // selected 6M cause names, informal use
  const [delayRanges, setDelayRanges] = useState({});      // { causeName: "15-30" }
  const DELAY_RANGE_OPTIONS = ["0-15", "15-30", "30-60", "60-120", "120+"];
  function toggleDelayType(m) {
    setDelayTypes(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    setDelayRanges(prev => { const n = { ...prev }; delete n[m]; return n; });
  }
  // Phase 1 CAPA fields
  const [rcaMethod, setRcaMethod] = useState("");
  const [why1, setWhy1] = useState("");
  const [why2, setWhy2] = useState("");
  const [why3, setWhy3] = useState("");
  const [why4, setWhy4] = useState("");
  const [why5, setWhy5] = useState("");
  const [fiveCategory, setFiveCategory] = useState("");
  const [preventiveAction, setPreventiveAction] = useState("");

  // Downtime evidence attachment
  const [attachmentFile, setAttachmentFile]     = useState(null);   // File object
  const [attachmentB64,  setAttachmentB64]       = useState(null);   // Base64 data-url
  const [attachmentName, setAttachmentName]      = useState('');
  const [attachmentMime, setAttachmentMime]      = useState('');
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  // Sign-off (no designation, change 7)
  const [reviewer, setReviewer] = useState("");
  const [revOther, setRevOther] = useState("");
  const [appStatus, setAppStatus] = useState("");
  const [revDate, setRevDate] = useState(new Date().toISOString().slice(0, 10));
  const [revComments, setRevComments] = useState("");

  // Done
  const [submission, setSubmission] = useState(null);
  const [gsStatus, setGsStatus] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  // Closing a Start/End task: its start and end times are prefilled and stay
  // editable for every role (see the clock card on the Activities page).
  const fromTask = !!taskPrefill;

  // Station times
  const [stationTimesApi, setStationTimesApi] = useState(null);
  const [timesLoading, setTimesLoading] = useState(true);
  const [timesError, setTimesError] = useState(null);

  useEffect(() => {
    fetchStationTimes()
      .then(api => { setStationTimesApi(api); setTimesLoading(false); })
      .catch(err => { console.warn("Travel Card: station times unavailable.", err.message); setTimesError(true); setTimesLoading(false); });
  }, []);

  // Persist projects & reviewers to localStorage
  useEffect(() => { LS.set("kmc_projects", projects); }, [projects]);
  useEffect(() => { LS.set("kmc_reviewers", reviewers); }, [reviewers]);

  // Pre-fill every field from the submission being edited. Runs once per
  // edit session (keyed on recordId) — after this, the fields behave like
  // normal form state so the user can correct anything before re-submitting.
  useEffect(() => {
    if (!editSubmission) return;
    const s = editSubmission;
    setCurProj(s.project || "");
    setBusModel(s.busModel || "");
    setVin(s.vin || "");
    setCurLine(s.line || "");
    setCurCode(s.stationCode || "");
    setCurSt(s.station || "");
    setSelOps(s.operators || []);
    setHseCount(s.hseResources ?? "");
    setClockIn(s.clockIn ? isoToLocalInput(s.clockIn) || s.clockIn : "");
    setClockOut(s.clockOut || "");
    setActStatuses(s.activityStatuses || {});
    setOtherActs(s.addedActivities || []);
    setResQtys(s.resourcesUsed || {});
    setOtherRes(s.otherResources || []);
    setOhs(!!s.ohsIssue);
    setOhsTxt(s.ohsIssue || "");
    setWaste(s.wasteGenerated || "");
    setGenComments(s.generalComments || "");
    setDelayTypes(s.unexpectedDelay?.types || []);
    setDelayRanges(s.unexpectedDelay?.ranges || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSubmission?.recordId]);

  // ── Manual session save/restore — an operator filling a long card can save
  // their progress and pick up later (or on a fresh page load) instead of
  // losing everything to a refresh or interruption. Explicit save/restore/
  // clear, not auto-saved, so it never silently overwrites a fresh card.
  const [savedSession, setSavedSession] = useState(() => LS.get(SESSION_KEY, null));
  const [sessionBanner, setSessionBanner] = useState(() => !!LS.get(SESSION_KEY, null));

  function buildSessionSnapshot() {
    return {
      savedAt: new Date().toISOString(),
      page, curProj, busModel, vin, curLine, curSt, curCode, designedTime,
      operators, selOps, hseCount, clockIn, clockOut,
      actualTime, grossTime, breakTime,
      actStatuses, otherActs, resQtys, removedRes, otherRes,
      ohs, ohsTxt, waste,
      hasDowntime, selMs, subCauses, causeTimes, customCauses, corrAction, orComments,
      rcaMethod, why1, why2, why3, why4, why5, fiveCategory, preventiveAction,
      reviewer, revOther, appStatus, revDate, revComments,
      genComments, delayTypes, delayRanges,
    };
  }

  function saveSession() {
    const snap = buildSessionSnapshot();
    LS.set(SESSION_KEY, snap);
    setSavedSession(snap);
    setSessionBanner(false);
    alert("Session saved. Come back to the Travel Card any time and click “Resume Saved Session” to continue.");
  }

  function restoreSession() {
    const snap = savedSession || LS.get(SESSION_KEY, null);
    if (!snap) return;
    setPage(snap.page ?? 0);
    setCurProj(snap.curProj ?? ""); setBusModel(snap.busModel ?? ""); setVin(snap.vin ?? "");
    setCurLine(snap.curLine ?? ""); setCurSt(snap.curSt ?? ""); setCurCode(snap.curCode ?? "");
    setDesignedTime(snap.designedTime ?? 0);
    setOperators(snap.operators ?? []); setSelOps(snap.selOps ?? []);
    setHseCount(snap.hseCount ?? ""); setClockIn(snap.clockIn ?? ""); setClockOut(snap.clockOut ?? "");
    setActualTime(snap.actualTime ?? 0); setGrossTime(snap.grossTime ?? 0); setBreakTime(snap.breakTime ?? 0);
    setActStatuses(snap.actStatuses ?? {}); setOtherActs(snap.otherActs ?? []);
    setResQtys(snap.resQtys ?? {}); setRemovedRes(snap.removedRes ?? []); setOtherRes(snap.otherRes ?? []);
    setOhs(snap.ohs ?? false); setOhsTxt(snap.ohsTxt ?? ""); setWaste(snap.waste ?? "");
    setHasDowntime(snap.hasDowntime ?? false); setSelMs(snap.selMs ?? []);
    setSubCauses(snap.subCauses ?? {}); setCauseTimes(snap.causeTimes ?? {});
    setCustomCauses(snap.customCauses ?? []); setCorrAction(snap.corrAction ?? ""); setOrComments(snap.orComments ?? "");
    setRcaMethod(snap.rcaMethod ?? ""); setWhy1(snap.why1 ?? ""); setWhy2(snap.why2 ?? ""); setWhy3(snap.why3 ?? "");
    setWhy4(snap.why4 ?? ""); setWhy5(snap.why5 ?? ""); setFiveCategory(snap.fiveCategory ?? "");
    setPreventiveAction(snap.preventiveAction ?? "");
    setReviewer(snap.reviewer ?? ""); setRevOther(snap.revOther ?? ""); setAppStatus(snap.appStatus ?? "");
    setRevDate(snap.revDate ?? new Date().toISOString().slice(0, 10)); setRevComments(snap.revComments ?? "");
    setGenComments(snap.genComments ?? ""); setDelayTypes(snap.delayTypes ?? []); setDelayRanges(snap.delayRanges ?? {});
    setSessionBanner(false);
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    setSavedSession(null);
    setSessionBanner(false);
  }

  // Auto-select locked station(s) (station-assigned users) — also loads operator pool.
  // Re-resolves when the bus model changes because some lines are model-suffixed
  // ("Chassis Line 01 — EVS/KDC") and the visible line list depends on the model.
  useEffect(() => {
    if (!lockedCodes.length) return;
    const LINES_L = resolveTcCatalog(catalog).lines;
    const kind = modelKindOf(busModel);

    function resolveCode(code) {
      // 1) Look for the code in the travel-card line lists, preferring the
      //    variant that matches the current bus model.
      let found = null;
      for (const [lineName, stns] of Object.entries(LINES_L)) {
        const match = stns.find(s => s.split(":")[0].trim() === code);
        if (!match) continue;
        const suffixed = /— (EVS|KDC|KEC)$/.test(lineName);
        if (!suffixed || lineName.endsWith(`— ${kind}`)) { found = { lineName, station: match }; break; }
        if (!found) found = { lineName, station: match };
      }
      // 2) Fallback: the admin station database has codes that aren't in
      //    TC_LINES (welding QA, chassis sub-stations, trim electrics, …).
      //    Derive the line from the seed record and synthesise the station label.
      if (!found) {
        const seed = SEED_STATIONS[code];
        if (seed) {
          const seedLabel = SEED_LINES.find(l => l.id === seed.line)?.label || "";
          const names = Object.keys(LINES_L);
          const lineName =
            names.find(n => n === `${seedLabel} — ${kind}`) ||
            names.find(n => n === seedLabel) ||
            names.find(n => n.startsWith(seedLabel)) || "";
          found = { lineName, station: `${code}: ${seed.name}` };
        }
      }
      return found;
    }

    if (!isMultiLocked) {
      const found = resolveCode(lockedCodes[0]);
      if (found) { setCurLine(found.lineName); onStation(found.station); }
      return;
    }

    // Multiple assigned stations (same line): resolve each, lock the line to
    // the first resolved one, and offer the rest as a restricted dropdown.
    const resolved = lockedCodes.map(resolveCode).filter(Boolean);
    if (resolved.length) {
      setCurLine(resolved[0].lineName);
      setLockedStationOptions(resolved.map(r => r.station));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedStation, JSON.stringify(lockedStations), busModel]);

  // Prefill current user into reviewer (supervisor) or operators (station user)
  useEffect(() => {
    if (!currentUserName) return;
    if (role === "user") {
      // Add to operator pool and auto-select them
      setOperators(prev => prev.includes(currentUserName) ? prev : [...prev, currentUserName]);
      setSelOps(prev => prev.includes(currentUserName) ? prev : [...prev, currentUserName]);
    } else if (role === "supervisor" || role === "manager" || role === "director") {
      // Prefill as reviewer
      setReviewer(currentUserName);
      if (!reviewers.includes(currentUserName)) {
        setReviewers(prev => [...prev, currentUserName]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserName]);

  // ── Closing a Start/End task ─────────────────────────────────────────────────
  // Phase 1 sets project / model / VIN / line; phase 2 (once the bus model has
  // rendered, so the station lookup uses the right family) picks the station and
  // carries the ticked activities and the start/end times over. Runs after the
  // station-lock effect above, so its activity reset does not undo this.
  const appliedTask = useRef(null);
  useEffect(() => {
    if (!taskPrefill) return;
    appliedTask.current = null;
    setCurProj(taskPrefill.project || "");
    setBusModel(taskPrefill.busModel || "");
    setVin(taskPrefill.vin || "");
    setCurLine(taskPrefill.line || "");
    // Remember the project and VIN locally (as "Add VIN" would) so both appear
    // in the dropdowns even when the VIN was typed at Start.
    if (taskPrefill.project) setProjects(p => {
      const cur = p[taskPrefill.project] || { vins: [] };
      const vins = cur.vins || [];
      return taskPrefill.vin && !vins.includes(taskPrefill.vin)
        ? { ...p, [taskPrefill.project]: { ...cur, vins: [...vins, taskPrefill.vin] } }
        : (p[taskPrefill.project] ? p : { ...p, [taskPrefill.project]: cur });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskPrefill?.taskId]);
  useEffect(() => {
    if (!taskPrefill || appliedTask.current === taskPrefill.taskId || busModel !== (taskPrefill.busModel || "")) return;
    appliedTask.current = taskPrefill.taskId;
    if (taskPrefill.station) onStation(taskPrefill.station);
    if (taskPrefill.designedMin > 0) setDesignedTime(taskPrefill.designedMin);
    const done = {};
    (taskPrefill.activities || []).forEach(a => { if (a.doneAt) done[a.name] = "complete"; });
    setActStatuses(done);
    setOtherActs((taskPrefill.activities || []).filter(a => a.added).map(a => a.name));
    setClockIn(isoToLocalInput(taskPrefill.startedAt));
    setClockOut(taskPrefill.endedAt || new Date().toISOString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskPrefill?.taskId, busModel, stationTimesApi]);

  // Which model family's template applies (EVS city bus, KDC diesel coach, KEC
  // electric coach). Lines, stations and "<family>:<code>" activities key off it.
  const modelKind = modelKindOf(busModel);

  // Admin edits (lines/stations/activities/resources) live in the catalog and
  // override or extend the built-in seed; src/utils/tcCatalog.js does the merge
  // and the per-model filtering, shared with Start/End and Catalog Admin.
  const tc = resolveTcCatalog(catalog);
  const visibleLines = tc.visibleLines(busModel);
  const stations = curLine ? tc.stationsFor(curLine, busModel) : [];
  const acts = tc.actsFor(curCode, busModel);
  const resList = tc.resFor(curLine, curCode);

  // Bus projects offered in the dropdown: union of locally-remembered projects
  // (which carry VIN memory) and active catalog projects added by an admin.
  const catalogProjectNames = (catalog.projects || [])
    .filter(p => p && p.name && p.active !== false)
    .map(p => p.name);
  const projectNames = [...new Set([...Object.keys(projects), ...catalogProjectNames])].sort();

  // Fleet VINs for the selected project, filtered to the selected bus model —
  // shared (from the catalog, admin-managed) merged with locally-remembered ones
  // (which carry no model tag, so they always show once a project is picked).
  const catalogFleet = (curProj && catalog.projectVins && catalog.projectVins[curProj]) || [];
  const catalogVinsForModel = catalogFleet.filter(v => v && v.vin && (!busModel || v.model === busModel)).map(v => v.vin);
  const localVins = (curProj && projects[curProj] && projects[curProj].vins) || [];
  const vinOptions = [...new Set([...catalogVinsForModel, ...localVins])];
  const revName = reviewer === "__other__" ? revOther : reviewer;

  // The shared consumables list loads asynchronously — if it arrives (or
  // changes) after a station was picked, fold any new names into the card.
  const sharedConsForStation = curCode ? stationCons.namesFor(curCode).join("\n") : "";
  useEffect(() => {
    if (!curCode || isEditMode || !sharedConsForStation) return;
    setOtherRes(prev => {
      const merged = mergeConsumables(prev, sharedConsForStation.split("\n"));
      return merged.length === prev.length ? prev : merged;
    });
  }, [curCode, isEditMode, sharedConsForStation]);

  function goTo(n) { setPage(n); window.scrollTo(0, 0); }

  function onStation(v) {
    setCurSt(v);
    const code = v.split(":")[0].trim();
    setCurCode(code);
    // A "KEC:T01-05"-style row in the Station Times sheet wins over the bare
    // code, since the KEC reuses some codes for different work.
    const mins = stationTimesApi
      ? (stationTimesApi.getMinutes(`${modelKind}:${code}`) ?? stationTimesApi.getMinutes(code) ?? 0)
      : 0;
    setDesignedTime(mins);
    setActStatuses({});
    setOtherActs([]); setOtherActName("");

    // Load remembered quantities and custom consumables for this station.
    // Custom consumables = everything anyone has added at this station (shared,
    // online) plus this device's own list; quantities come from this device.
    const nz = v => (v && (Array.isArray(v) ? v.length : Object.keys(v).length) ? v : null);
    const preset = presetFor(stationPresets, code, busModel);
    const savedQtys = nz(LS.get(`kmc_qty_${code}`, null)) ?? preset?.qtys ?? {};
    setResQtys(savedQtys);
    setRemovedRes([]);
    const localOther = nz(LS.get(`kmc_other_res_${code}`, null));
    const baseOther = localOther ?? preset?.other ?? [];
    setOtherRes(mergeConsumables(baseOther, stationCons.namesFor(code)));
    if (!mins && preset?.designedTime) setDesignedTime(preset.designedTime);

    // Load station-specific operator pool and remembered selection
    const stationOps = nz(LS.get(`kmc_station_ops_${code}`, null)) ?? preset?.operators ?? [];
    setOperators(stationOps);
    const savedSel = LS.get(`kmc_sel_${code}`, stationOps);
    setSelOps(savedSel.filter(s => stationOps.includes(s)));
  }

  function saveQtyMemory(qtys, code) {
    if (code) LS.set(`kmc_qty_${code}`, qtys);
  }

  function saveOtherResMemory(list, code) {
    if (code) LS.set(`kmc_other_res_${code}`, list);
  }

  function updateQty(r, val) {
    const next = { ...resQtys, [r]: val };
    setResQtys(next);
    saveQtyMemory(next, curCode);
  }

  // change 4: clockOut is captured here (when operator leaves identity page)
  function p0next() {
    if (!curProj) { alert("Select or add a bus project."); return; }
    if (!busModel) { alert("Select a bus model."); return; }
    if (!vin) { alert("Select or add a Bus VIN."); return; }
    if (!curLine) { alert("Select a production line."); return; }
    if (!curSt) { alert("Select a station."); return; }
    // Editing an existing card shouldn't silently reset its original
    // clock-out to "now" — only a fresh submission auto-stamps it.
    if (!isEditMode && !fromTask) setClockOut(new Date().toISOString());
    goTo(1);
  }

  function p1next() {
    if (!clockIn) { alert("Enter a clock-in time."); return; }
    const { gross, breaks: brkMin, net: actual } = productiveMinutes(clockIn, clockOut);
    setGrossTime(gross);
    setBreakTime(brkMin);
    setActualTime(actual);
    // Plain users submit directly — no downtime or sign-off tabs
    if (isUser) {
      if (isEditMode) { saveEditedCard(gross, brkMin, actual); return; }
      submitUserCard(gross, brkMin, actual); return;
    }
    if (actual > 0 && designedTime > 0 && actual > designedTime) {
      setHasDowntime(true); setSelMs([]); setSubCauses({}); setCauseTimes({}); setCustomCauses([]); goTo(2); return;
    }
    setHasDowntime(false); goTo(3);
  }

  async function saveEditedCard(gross, brkMin, actual) {
    saveQtyMemory(resQtys, curCode);
    saveOtherResMemory(otherRes, curCode);
    if (curCode) LS.set(`kmc_station_ops_${curCode}`, operators);
    if (curCode) LS.set(`kmc_sel_${curCode}`, selOps);

    const patch = {
      recordId: editSubmission.recordId,
      busModel, project: curProj, vin,
      line: curLine, station: curSt, stationCode: curCode,
      operators: selOps, hseResources: hseCount,
      clockIn, clockOut, actualTime: actual, designedTime,
      grossTime: gross, breakMinutes: brkMin,
      activityStatuses: actStatuses,
      addedActivities: otherActs,
      resourcesUsed: resQtys,
      otherResources: usedOtherRes(otherRes),
      ohsIssue: ohs ? ohsTxt : null,
      wasteGenerated: waste,
      generalComments: genComments.trim() || null,
      unexpectedDelay: delayTypes.length
        ? { types: delayTypes, ranges: delayTypes.reduce((o, t) => { if (delayRanges[t]) o[t] = delayRanges[t]; return o; }, {}) }
        : null,
    };
    setGsStatus("Saving your changes…");
    const result = await onEditSubmit(patch);
    if (result.ok) {
      setSubmission({ ...editSubmission, ...patch, timestamp: editSubmission.timestamp });
      setGsStatus("✅ Changes saved.");
      goTo(4);
    } else if (result.error === "already-approved") {
      alert("This card has already been approved by a supervisor and can no longer be edited.");
      setGsStatus("");
    } else {
      alert(`Could not save changes: ${result.error || "unknown error"}`);
      setGsStatus("");
    }
  }

  async function submitUserCard(gross, brkMin, actual) {
    saveQtyMemory(resQtys, curCode);
    saveOtherResMemory(otherRes, curCode);
    if (curCode) LS.set(`kmc_station_ops_${curCode}`, operators);
    if (curCode) LS.set(`kmc_sel_${curCode}`, selOps);

    const sub = {
      timestamp: new Date().toISOString(),
      busModel, project: curProj, vin,
      line: curLine, station: curSt, stationCode: curCode,
      operators: selOps, hseResources: hseCount,
      clockIn, clockOut, actualTime: actual, designedTime,
      hasDowntime: false,
      grossTime: gross, breakMinutes: brkMin,
      activityStatuses: actStatuses,
      addedActivities: otherActs,
      resourcesUsed: resQtys,
      removedResources: removedRes,
      otherResources: usedOtherRes(otherRes),
      ohsIssue: ohs ? ohsTxt : null,
      wasteGenerated: waste,
      downtime: null,
      generalComments: genComments.trim() || null,
      unexpectedDelay: delayTypes.length
        ? { types: delayTypes, ranges: delayTypes.reduce((o, t) => { if (delayRanges[t]) o[t] = delayRanges[t]; return o; }, {}) }
        : null,
      submittedBy: currentUserName || null,
      reviewer: null,
      approvalStatus: "pending_review",
      reviewDate: null, reviewComments: null,
    };
    setSubmission(sub);
    goTo(4);

    appendBusLog(vin, sub);

    const pending = LS.get("kmc_pending_reviews", []);
    LS.set("kmc_pending_reviews", [...pending, { ...sub, id: Date.now().toString() }]);

    setGsStatus("Saving to production records…");
    try {
      const body = new URLSearchParams({ payload: JSON.stringify(sub) });
      await fetch(SHEETS_URL, { method: "POST", mode: "no-cors", body });
      setGsStatus("✅ Submitted. Awaiting supervisor review.");
      if (onSubmitSuccess) onSubmitSuccess();
      afterFiled(sub);
    } catch {
      setGsStatus("⚠️ Could not reach Google Sheets. Download your record below.");
    }
  }

  function togM(m) {
    setSelMs(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    setSubCauses(prev => { const n = { ...prev }; if (prev[m]) delete n[m]; return n; });
    setCauseTimes(prev => { const n = { ...prev }; if (prev[m] !== undefined) delete n[m]; return n; });
  }

  // Add a custom root cause (outside the 6Ms) and auto-select it.
  function addCustomCause(name) {
    const n = name.trim();
    if (!n) return;
    if (!customCauses.includes(n) && !SIX.some(x => x.m === n)) {
      setCustomCauses(prev => [...prev, n]);
    }
    setSelMs(prev => prev.includes(n) ? prev : [...prev, n]);
    setCustomCauseName("");
  }

  function removeCustomCause(name) {
    setCustomCauses(prev => prev.filter(x => x !== name));
    setSelMs(prev => prev.filter(x => x !== name));
    setSubCauses(prev => { const n = { ...prev }; delete n[name]; return n; });
    setCauseTimes(prev => { const n = { ...prev }; delete n[name]; return n; });
  }

  function handleAttachmentChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentFile(file);
    setAttachmentName(file.name);
    setAttachmentMime(file.type);
    const reader = new FileReader();
    reader.onload = ev => setAttachmentB64(ev.target.result); // data-url including mime prefix
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!revName) { alert("Enter a reviewer name."); return; }
    if (!appStatus) { alert("Select an approval status."); return; }

    // save qty memory, custom consumables & station staff on submit
    saveQtyMemory(resQtys, curCode);
    saveOtherResMemory(otherRes, curCode);
    if (curCode) LS.set(`kmc_station_ops_${curCode}`, operators);
    if (curCode) LS.set(`kmc_sel_${curCode}`, selOps);

    const sub = {
      timestamp: new Date().toISOString(),
      busModel, project: curProj, vin,
      line: curLine, station: curSt, stationCode: curCode,
      operators: selOps, hseResources: hseCount,
      clockIn, clockOut, actualTime, designedTime, hasDowntime,
      grossTime, breakMinutes: breakTime,
      activityStatuses: actStatuses,
      addedActivities: otherActs,
      resourcesUsed: resQtys,
      removedResources: removedRes,
      otherResources: usedOtherRes(otherRes),
      ohsIssue: ohs ? ohsTxt : null,
      wasteGenerated: waste,
      downtime: hasDowntime ? { selMs, subCauses, causeTimes, customCauses, correctiveAction: corrAction, comments: orComments, rcaMethod, why1, why2, why3, why4, why5, category: fiveCategory, preventiveAction, attachmentName, attachmentMime, attachmentB64 } : null,
      submittedBy: currentUserName || null,
      reviewer: revName, approvalStatus: appStatus, reviewDate: revDate, reviewComments: revComments,
    };
    setSubmission(sub);
    goTo(4);

    // change 10: save to bus log in localStorage
    appendBusLog(vin, sub);

    setGsStatus("Saving to Google Sheets…");
    try {
      // URLSearchParams is a CORS-safelisted body type — works with no-cors.
      // Content-Type: application/json is NOT safelisted and gets silently dropped
      // by the browser, so we send the payload as a form field instead.
      const body = new URLSearchParams({ payload: JSON.stringify(sub) });
      await fetch(SHEETS_URL, { method: "POST", mode: "no-cors", body });
      setGsStatus("✅ Saved to production records.");
      if (onSubmitSuccess) onSubmitSuccess();
      afterFiled(sub);
    } catch {
      setGsStatus("⚠️ Could not reach Google Sheets. Download the record below.");
    }
  }

  // change 10: two PDF download functions
  const [dlBusy, setDlBusy] = useState("");

  async function dlStationReport() {
    if (!submission || dlBusy) return;
    setDlBusy("station");
    try {
      await downloadStationReport(submission, { theme });
    } catch (e) { console.error("PDF error:", e); alert("PDF generation failed. Check console."); }
    finally { setDlBusy(""); }
  }

  // Every card filed for this VIN from ANY device (the sheet), plus this
  // device's own recent cards the sheet hasn't caught up with yet (a card
  // submitted seconds ago), de-duplicated by station + submit time.
  // A card was filed: tell the hub (closes the Start/End task it came from) and
  // email the submitter + approvers with both reports attached.
  function afterFiled(sub) {
    if (onCardSubmitted) onCardSubmitted(sub, taskPrefill);
    setEmailStatus("📧 Emailing your station and bus reports…");
    emailCardReports(sub)
      .then(reply => setEmailStatus(describeCardEmail(reply)))
      .catch(e => setEmailStatus(`⚠️ Email not sent: ${e.message}`));
  }

  async function dlBusReport() {
    if (!submission || dlBusy) return;
    setDlBusy("bus");
    try {
      const cards = await busCardsFor(submission.vin);
      await downloadBusReport(cards, { theme, vin: submission.vin });
    } catch (e) { console.error("PDF error:", e); alert("PDF generation failed. Check console."); }
    finally { setDlBusy(""); }
  }

  function another() {
    const km = busModel, kp = curProj, kv = vin;
    setActStatuses({}); setOtherActs([]); setOtherActName(""); setResQtys({}); setRemovedRes([]); setOtherRes([]);
    setClockIn(""); setClockOut(""); setOhs(false); setOhsTxt(""); setWaste("");
    setHasDowntime(false); setActualTime(0); setGrossTime(0); setBreakTime(0); setSelMs([]); setSubCauses({}); setCauseTimes({}); setCustomCauses([]); setCustomCauseName("");
    setAttachmentFile(null); setAttachmentB64(null); setAttachmentName(''); setAttachmentMime('');
    setCorrAction(""); setOrComments("");
    setRcaMethod(""); setWhy1(""); setWhy2(""); setWhy3(""); setWhy4(""); setWhy5(""); setFiveCategory(""); setPreventiveAction("");
    setReviewer(""); setRevOther("");
    setAppStatus(""); setRevComments(""); setSubmission(null); setGsStatus(""); setEmailStatus("");
    setBusModel(km); setCurProj(kp); setVin(kv);
    // Stay on the same line + station and reload its memory (operators,
    // quantities, custom consumables) for the next fill-in. Clearing it used to
    // strand station-locked users: their station box is disabled and the
    // auto-select only re-runs when the bus model changes.
    if (curSt) { onStation(curSt); }
    else { setCurLine(""); setCurCode(""); setDesignedTime(0); setSelOps([]); setOperators([]); }
    if (onReset) onReset();
    goTo(0);
  }

  const LABELS = isUser
    ? ["Identity", "Activities", "Done"]
    : ["Identity", "Activities", "Downtime", "Sign-off", "Done"];
  // Map real page index to visual segment index for user role
  const userPageToSeg = { 0: 0, 1: 1, 4: 2 };
  const visSeg = isUser ? (userPageToSeg[page] ?? 1) : page;
  const segStyle = i => ({ ...css.seg, ...(i < visSeg ? css.segDone : i === visSeg ? css.segAct : {}) });
  const lblStyle = i => ({ ...css.lbl, ...(i === visSeg ? css.lblAct : i < visSeg ? css.lblDone : {}) });

  return (
    // The page background (bus photo + overlay) comes from .kmc-page around it.
    <div style={{ position: 'relative' }}>
    <div style={{...css.wrap, position: 'relative', zIndex: 1}} className="tc-wrap">
      <style>{`
        .tc-wrap select option,
        .tc-wrap select optgroup {
          background: ${T.inpBg};
          color: ${T.text};
          font-family: 'Inter', system-ui, sans-serif;
        }
        .tc-wrap select option:checked,
        .tc-wrap select option:hover {
          background: rgba(220,38,38,0.25);
          color: #fca5a5;
        }
        .tc-wrap input:focus,
        .tc-wrap select:focus,
        .tc-wrap textarea:focus {
          border-color: rgba(220,38,38,0.55) !important;
          box-shadow: 0 0 0 2px rgba(220,38,38,0.12);
        }
        .tc-wrap input[type="date"]::-webkit-calendar-picker-indicator,
        .tc-wrap input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          filter: invert(0.6) sepia(1) saturate(3) hue-rotate(310deg);
          cursor: pointer;
        }
        .tc-wrap input[type="number"]::-webkit-inner-spin-button {
          filter: invert(0.4);
        }
        .tc-wrap select {
          appearance: auto;
        }
        .tc-wrap .add-btn:hover { background: rgba(220,38,38,0.15) !important; }
      `}</style>
      {/* Header */}
      <div style={css.topbar}>
        <img src={theme === 'dark' ? '/kmc logo 2.png' : '/kmc logo.png'} alt="KMC" style={css.logo} />
        <div>
          <div style={css.t1}>Production Travel Card</div>
          <div style={css.t2}>KMC.DPN.05/26-FM004 · Rev #01</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={css.addBtn} onClick={saveSession} title="Save your progress so you can continue later">
            💾 Save Session
          </button>
          {savedSession && (
            <button style={css.addBtn} onClick={() => { if (confirm("Clear the saved session? This cannot be undone.")) clearSession(); }} title="Discard the saved session">
              ✕ Clear Saved Session
            </button>
          )}
        </div>
      </div>

      {/* Resume banner — only shown once, until dismissed/resumed/cleared */}
      {sessionBanner && savedSession && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "rgba(220,38,38,0.08)", border: `1px solid ${RB}`, borderRadius: 6,
          padding: "10px 14px", marginBottom: 10, fontSize: 12, color: T.text,
        }}>
          <span>You have a saved session from {new Date(savedSession.savedAt).toLocaleString()}.</span>
          <button style={{ ...css.addBtn, marginLeft: "auto" }} onClick={restoreSession}>Resume Saved Session</button>
          <button style={css.addBtn} onClick={() => { if (confirm("Discard the saved session and start fresh?")) clearSession(); }}>Discard & Start Fresh</button>
        </div>
      )}

      {/* Progress bar */}
      <div style={css.segsWrap}>{LABELS.map((_, i) => <div key={i} style={segStyle(i)} />)}</div>
      <div style={css.lblsWrap}>{LABELS.map((l, i) => <span key={i} style={lblStyle(i)}>{l}</span>)}</div>

      {/* ── PAGE 0: IDENTITY ── */}
      {page === 0 && <>
        {/* change 2: Project first */}
        <div style={css.card}>
          <div style={css.cardHd}>Bus project</div>
          <div style={css.fld}>
            <label style={css.lbl_}>Project</label>
            <select style={css.inp} value={curProj} onChange={e => { const v = e.target.value; setCurProj(v); if (v && !projects[v]) setProjects(p => ({ ...p, [v]: { vins: [] } })); }}>
              <option value="">Select project…</option>
              {projectNames.map(p => <option key={p}>{p}</option>)}
            </select>
            <AddRow placeholder="Add new project name…" onAdd={n => { if (!n.trim()) return; setProjects(p => ({ ...p, [n.trim()]: { vins: [] } })); setCurProj(n.trim()); }} />
            <div style={css.tagRow}>{Object.keys(projects).map(p => <Tag key={p} label={p} onDel={() => { setProjects(prev => { const n = { ...prev }; delete n[p]; return n; }); if (curProj === p) setCurProj(""); }} />)}</div>
          </div>
        </div>

        <div style={css.card}>
          <div style={css.cardHd}>Bus identity</div>
          <Sel label="Bus model" value={busModel} onChange={e => { setBusModel(e.target.value); setCurLine(""); setCurSt(""); setCurCode(""); }}>
            <option value="">Select model…</option>
            <optgroup label="KDC — Diesel Coach">
              <option value="10.5m KDC">10.5m KDC</option>
              <option value="12m KDC">12m KDC</option>
            </optgroup>
            <optgroup label="EVS — Electric City Bus">
              <option value="7m EVS">7m EVS</option>
              <option value="8.5m EVS">8.5m EVS</option>
              <option value="10.5m EVS">10.5m EVS</option>
              <option value="12m EVS">12m EVS</option>
            </optgroup>
            <optgroup label="KEC — Electric Coach">
              <option value="13m KEC">13m KEC</option>
            </optgroup>
          </Sel>

          {busModel && <>
            <div style={css.fld}>
              <label style={css.lbl_}>Bus VIN</label>
              <select style={css.inp} value={vin} onChange={e => setVin(e.target.value)}>
                <option value="">Select VIN…</option>
                {vinOptions.map(v => <option key={v}>{v}</option>)}
              </select>
              <AddRow placeholder="Add VIN for this project…" onAdd={n => { if (!n.trim() || !curProj) return; setProjects(p => ({ ...p, [curProj]: { ...p[curProj], vins: [...(p[curProj]?.vins || []), n.trim()] } })); setVin(n.trim()); }} />
              <div style={css.tagRow}>
                {catalogVinsForModel.map(v => <Tag key={'c_' + v} label={v} />)}
                {localVins.filter(v => !catalogVinsForModel.includes(v)).map(v => <Tag key={'l_' + v} label={v} onDel={() => setProjects(p => ({ ...p, [curProj]: { ...p[curProj], vins: p[curProj].vins.filter(x => x !== v) } }))} />)}
              </div>
            </div>
          </>}
        </div>

        {busModel && <>
          <div style={css.card}>
            <div style={css.cardHd}>Station</div>
            <div className="tc-grid-2" style={css.g2}>
              <Sel label="Production line" value={curLine} disabled={lockedCodes.length > 0} onChange={e => { setCurLine(e.target.value); setCurSt(""); setCurCode(""); setDesignedTime(0); setSelOps([]); setOperators([]); }}>
                <option value="">Select line…</option>
                {visibleLines.map(l => <option key={l}>{l}</option>)}
                {curLine && !visibleLines.includes(curLine) && <option>{curLine}</option>}
              </Sel>
              <Sel
                label={isMultiLocked ? "Station (assigned — choose one)" : lockedStation ? "Station (assigned — locked)" : "Station"}
                value={curSt}
                disabled={!!lockedStation && !isMultiLocked}
                onChange={e => onStation(e.target.value)}
              >
                <option value="">Select station…</option>
                {(isMultiLocked ? lockedStationOptions : stations).map(s => <option key={s} value={s}>{stationLabelForModel(s, modelKind)}</option>)}
                {curSt && !(isMultiLocked ? lockedStationOptions : stations).includes(curSt) && <option>{curSt}</option>}
              </Sel>
            </div>
            {/* Admin can always override the designed (cycle) time */}
            {isAdmin && curCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: R, fontFamily: T.mono, letterSpacing: "0.04em" }}>Designed time (admin):</span>
                <input type="number" style={{ ...css.inp, maxWidth: 90, fontSize: 12 }} value={designedTime || ""} onChange={e => setDesignedTime(Number(e.target.value) || 0)} min="0" placeholder="min" />
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>min</span>
              </div>
            )}
            {!isAdmin && !isUser && timesLoading && curCode && <div style={{ ...css.pill, opacity: .6, marginTop: 6 }}>⏱ Loading cycle time…</div>}
            {!isAdmin && !isUser && !timesLoading && timesError && curCode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: AM, fontFamily: T.mono }}>⚠ Sheet unavailable — enter manually:</span>
                <input type="number" style={{ ...css.inp, maxWidth: 90, fontSize: 12 }} value={designedTime || ""} onChange={e => setDesignedTime(Number(e.target.value) || 0)} min="0" placeholder="min" />
              </div>
            )}
            {!isAdmin && !isUser && !timesLoading && !timesError && curCode && designedTime > 0 && (
              <div style={{ ...css.pill, marginTop: 8 }}>⏱ Designed time: <strong style={{ marginLeft: 4 }}>{designedTime} min</strong></div>
            )}
            {!isAdmin && !isUser && !timesLoading && !timesError && curCode && designedTime === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 11, color: T.dim, fontFamily: T.mono }}>
                No cycle time set — enter manually:&nbsp;
                <input type="number" style={{ ...css.inp, maxWidth: 80, fontSize: 12, display: "inline", width: 80 }} value={designedTime || ""} onChange={e => setDesignedTime(Number(e.target.value) || 0)} min="0" placeholder="min" />
              </div>
            )}
          </div>

          {/* change 3: Staff on duty after station selection */}
          {curSt && <div style={css.card}>
            <div style={css.cardHd}>Staff on duty — {curCode}</div>
            <div className="tc-cb-grid" style={css.cbGrid}>
              {operators.map(op => <label key={op} style={css.cbItem}>
                <input type="checkbox" checked={selOps.includes(op)} onChange={e => { const newSel = e.target.checked ? [...selOps, op] : selOps.filter(x => x !== op); setSelOps(newSel); if (curCode) LS.set(`kmc_sel_${curCode}`, newSel); }} style={{ accentColor: R, width: 13, height: 13, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: T.muted }}>{op}</span>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 13 }} onClick={() => { const newOps = operators.filter(x => x !== op); setOperators(newOps); setSelOps(prev => prev.filter(x => x !== op)); if (curCode) LS.set(`kmc_station_ops_${curCode}`, newOps); }}>×</button>
              </label>)}
            </div>
            <AddRow placeholder="Add staff member name…" onAdd={n => { if (!n.trim()) return; const newOps = [...operators, n.trim()]; setOperators(newOps); setSelOps(prev => [...prev, n.trim()]); if (curCode) LS.set(`kmc_station_ops_${curCode}`, newOps); }} />
            <div style={{ ...css.fld, marginTop: 14 }}>
              <label style={css.lbl_}>HSE resources required (count)</label>
              <input type="number" style={{ ...css.inp, maxWidth: 120 }} value={hseCount} onChange={e => setHseCount(e.target.value)} min="0" placeholder="0" />
            </div>
          </div>}
        </>}

        <div style={css.px}>
          <button style={css.btnP} onClick={p0next}>Continue to activities →</button>
        </div>
      </>}

      {/* ── PAGE 1: ACTIVITIES ── */}
      {page === 1 && <>
        <div style={css.card}>
          <div style={css.cardHd}>Clock in{isAdmin || fromTask ? " / out" : ""}</div>
          {/* change 4: clock-out removed; only clock-in here */}
          <Inp label="Clock in time" type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} />
          {isAdmin || fromTask ? (
            <>
              <Inp
                label={fromTask ? "Clock out time" : "Clock out time (admin)"}
                type="datetime-local"
                value={isoToLocalInput(clockOut)}
                onChange={e => setClockOut(e.target.value ? new Date(e.target.value).toISOString() : "")}
              />
              <div style={css.note}>{fromTask ? "Start and end were recorded when you pressed Start and Close. Correct them here if needed." : "Admin can adjust the auto-recorded clock-out time."}</div>
            </>
          ) : (
            <div style={css.note}>Clock-out was recorded automatically when you completed the identity page.</div>
          )}
          <div style={{ ...css.note, marginTop: 8 }}>
            ⏱ Time used excludes scheduled breaks (tea {SCHEDULE.breaks[0].start}–{SCHEDULE.breaks[0].end}, lunch {SCHEDULE.breaks[1].start}–{SCHEDULE.breaks[1].end}). Default shift {SCHEDULE.shiftStart}–{SCHEDULE.shiftEnd}; weekday time counts 08:00–18:00 only, Sundays are not counted and Saturday counts 08:00–13:00.
          </div>
        </div>

        <div style={css.card}>
          <div style={{ ...css.cardHd, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Activities — <span style={{ fontWeight: 400, color: T.dim }}>{curCode}</span></span>
            {(acts.length > 0 || otherActs.length > 0) && (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { const all = {}; [...acts, ...otherActs].forEach(a => { all[a] = "complete"; }); setActStatuses(all); }}
                  style={{ fontSize: 10, padding: "3px 10px", border: "1px solid rgba(16,185,129,0.35)", borderRadius: 3, background: "rgba(16,185,129,0.08)", color: "#10b981", cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.06em" }}
                >
                  ALL COMPLETE
                </button>
                <button
                  onClick={() => setActStatuses({})}
                  style={{ fontSize: 10, padding: "3px 10px", border: `1px solid ${T.border}`, borderRadius: 3, background: "transparent", color: T.dim, cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.06em" }}
                >
                  CLEAR
                </button>
              </div>
            )}
          </div>
          {acts.length === 0 && otherActs.length === 0 && <div style={{ fontSize: 12, color: T.dim }}>No predefined activities for this station — add one below.</div>}
          {acts.map((a, i) => <div key={i} className="tc-act-row" style={{ ...css.actRow, ...(i === acts.length - 1 && otherActs.length === 0 ? { borderBottom: "none" } : {}) }}>
            <div style={css.actName}>{a}</div>
            <select style={css.stSel} value={actStatuses[a] || ""} onChange={e => setActStatuses(p => ({ ...p, [a]: e.target.value }))}>
              <option value="">Status…</option>
              <option value="complete">✅ Complete</option>
              <option value="incomplete">⏳ Incomplete</option>
              <option value="issue">⚠️ Issue noted</option>
              <option value="rework">🔁 Rework needed</option>
              <option value="na">— N/A</option>
            </select>
          </div>)}
          {/* Ad-hoc activities added on this card (not in the predefined list) */}
          {otherActs.map((a, i) => <div key={`o${i}`} className="tc-act-row" style={{ ...css.actRow, gridTemplateColumns: "1fr 140px 28px", ...(i === otherActs.length - 1 ? { borderBottom: "none" } : {}) }}>
            <div style={css.actName}>{a}</div>
            <select style={css.stSel} value={actStatuses[a] || ""} onChange={e => setActStatuses(p => ({ ...p, [a]: e.target.value }))}>
              <option value="">Status…</option>
              <option value="complete">✅ Complete</option>
              <option value="incomplete">⏳ Incomplete</option>
              <option value="issue">⚠️ Issue noted</option>
              <option value="rework">🔁 Rework needed</option>
              <option value="na">— N/A</option>
            </select>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 16, lineHeight: 1 }} title="Remove activity"
              onClick={() => { setOtherActs(prev => prev.filter(x => x !== a)); setActStatuses(prev => { const n = { ...prev }; delete n[a]; return n; }); }}>×</button>
          </div>)}
          <div style={css.subSec}>
            <div style={css.subHd}>Other activity (not in list)</div>
            <div style={css.addRow}>
              <input style={css.addInp} value={otherActName} onChange={e => setOtherActName(e.target.value)} placeholder="Activity description…"
                onKeyDown={e => { if (e.key === "Enter") { const n = otherActName.trim(); if (n && !acts.includes(n) && !otherActs.includes(n)) { setOtherActs(p => [...p, n]); } setOtherActName(""); } }} />
              <button style={css.addBtn} onClick={() => { const n = otherActName.trim(); if (n && !acts.includes(n) && !otherActs.includes(n)) { setOtherActs(p => [...p, n]); } setOtherActName(""); }}>+ ADD</button>
            </div>
          </div>
        </div>

        {/* change 5: "Consumables & Materials Used" */}
        <div style={css.card}>
          <div style={css.cardHd}>Consumables & Materials Used</div>
          {resList.filter(r => !removedRes.includes(r)).length === 0 && <div style={{ fontSize: 12, color: T.dim, marginBottom: 8 }}>No preset consumables for this station.</div>}
          {resList.filter(r => !removedRes.includes(r)).map((r, i, arr) => <div key={r} className="tc-res-row" style={{ ...css.resRow, ...(i === arr.length - 1 ? { borderBottom: "none" } : {}), gridTemplateColumns: "1fr 70px 28px" }}>
            <div style={css.resName}>{r}</div>
            <input type="number" style={css.qty} min="0" placeholder="0" value={resQtys[r] || ""} onChange={e => updateQty(r, e.target.value)} />
            <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 16, lineHeight: 1, padding: 0, textAlign: "center" }} title="Remove consumable" onClick={() => { setRemovedRes(p => [...p, r]); const next = { ...resQtys }; delete next[r]; setResQtys(next); saveQtyMemory(next, curCode); }}>×</button>
          </div>)}
          <div style={css.subSec}>
            <div style={css.subHd}>Other consumable / material (not in list)</div>
            <div style={css.addRow}>
              <input style={css.addInp} value={otherResName} onChange={e => setOtherResName(e.target.value)} placeholder="Consumable or material name…" />
              <input type="number" style={{ ...css.qty, flexShrink: 0 }} value={otherResQty} onChange={e => setOtherResQty(e.target.value)} placeholder="Qty" />
              <button style={css.addBtn} onClick={() => {
                const name = otherResName.trim();
                if (!name) return;
                // Same name again just updates the quantity rather than duplicating the row.
                const exists = otherRes.some(r => r.name.toLowerCase() === name.toLowerCase());
                const next = exists
                  ? otherRes.map(r => r.name.toLowerCase() === name.toLowerCase() ? { ...r, qty: otherResQty || r.qty } : r)
                  : [...otherRes, { name, qty: otherResQty || "" }];
                setOtherRes(next); saveOtherResMemory(next, curCode);
                stationCons.add(curCode, name, currentUserName || "");
                setOtherResName(""); setOtherResQty("");
              }}>+ ADD</button>
            </div>
            {otherRes.length > 0 && <div style={{ fontSize: 11, color: T.dim, margin: "4px 0 2px" }}>Added at this station — stays for every fill-in here until removed with ×. Leave the quantity empty if not used this time.</div>}
            {otherRes.map((r, i) => <div key={r.name} className="tc-res-row" style={{ ...css.resRow, borderBottom: "none" }}>
              <div style={css.resName}>{r.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" min="0" style={css.qty} value={r.qty} placeholder="Qty"
                  onChange={e => { const next = otherRes.map((x, j) => j === i ? { ...x, qty: e.target.value } : x); setOtherRes(next); saveOtherResMemory(next, curCode); }} />
                <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 16, lineHeight: 1, padding: 0 }}
                  title="Remove this consumable from the station for everyone"
                  onClick={() => {
                    if (!confirm(`Remove "${r.name}" from ${curCode} for everyone?`)) return;
                    const next = otherRes.filter((_, j) => j !== i); setOtherRes(next); saveOtherResMemory(next, curCode);
                    stationCons.remove(curCode, r.name);
                  }}>×</button>
              </div>
            </div>)}
          </div>
        </div>

        <div style={css.card}>
          <div style={css.cardHd}>Health, safety & environment</div>
          <div style={css.fld}>
            <label style={css.lbl_}>OHS issue?</label>
            <div style={css.togWrap}>
              <label style={{ position: "relative", width: 36, height: 20, flexShrink: 0, display: "block" }}>
                <input type="checkbox" checked={ohs} onChange={e => setOhs(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{ position: "absolute", inset: 0, background: ohs ? R : T.border, borderRadius: 20, cursor: "pointer", transition: ".2s" }} />
                <span style={{ position: "absolute", width: 14, height: 14, left: ohs ? 20 : 3, top: 3, background: "#fff", borderRadius: "50%", transition: ".2s" }} />
              </label>
              <span style={{ fontSize: 12, color: T.muted }}>{ohs ? "Issue reported" : "No issue"}</span>
            </div>
            {ohs && <textarea style={{ ...css.ta, marginTop: 8 }} value={ohsTxt} onChange={e => setOhsTxt(e.target.value)} placeholder="Describe the OHS issue…" />}
          </div>
          <div style={css.fld}>
            <label style={css.lbl_}>Waste generated</label>
            <input style={css.inp} value={waste} onChange={e => setWaste(e.target.value)} placeholder="e.g. Used sandpaper, solvent rags, metal offcuts…" />
          </div>
        </div>

        {isUser && <div style={css.card}>
          <div style={css.cardHd}>Additional notes <span style={{ ...css.mSub, marginLeft: 6 }}>(optional)</span></div>
          <div style={css.fld}>
            <label style={css.lbl_}>Comments</label>
            <textarea style={css.ta} value={genComments} onChange={e => setGenComments(e.target.value)} placeholder="Anything worth flagging about this station run…" />
          </div>
          <div style={{ ...css.fld, marginTop: 12 }}>
            <label style={css.lbl_}>Unexpected delay / time lost</label>
            <div style={css.mSub}>Select any that applied — no exact time needed, just a rough range.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {SIX.map(m => <div key={m.m} style={{ ...css.mCard, ...(delayTypes.includes(m.m) ? css.mCardSel : {}), flex: "0 0 auto", padding: "6px 10px", cursor: "pointer" }} onClick={() => toggleDelayType(m.m)}>
                {m.icon} {m.m}
              </div>)}
            </div>
            {delayTypes.map(m => (
              <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 12, color: T.muted }}>{m}</span>
                <select style={{ ...css.inp, maxWidth: 140 }} value={delayRanges[m] || ""} onChange={e => setDelayRanges(p => ({ ...p, [m]: e.target.value }))}>
                  <option value="">Time range…</option>
                  {DELAY_RANGE_OPTIONS.map(r => <option key={r} value={r}>{r === "120+" ? "120+ min" : `${r.replace("-", "–")} min`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>}

        <div style={css.nav2}>
          <button style={{ ...css.btnS, marginTop: 0, flex: .35 }} onClick={() => goTo(0)}>← Back</button>
          <button style={{ ...css.btnP, marginTop: 0, flex: 1 }} onClick={p1next}>
            {isEditMode ? "Save Changes →" : isUser ? "Submit for Review →" : "Continue →"}
          </button>
        </div>
      </>}

      {/* ── PAGE 2: DOWNTIME ── */}
      {page === 2 && <>
        <div style={css.banner}>
          <span style={{ fontSize: 20, color: AM, flexShrink: 0 }}>⚠</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: AM, letterSpacing: "0.06em" }}>Station time exceeded</div>
            <div style={{ fontSize: 11, color: AM, marginTop: 3 }}>Please identify the root cause below before proceeding to sign-off.</div>
          </div>
        </div>

        <div style={css.stat3}>
          <div style={css.statC}><div style={css.statV}>{designedTime}</div><div style={css.statL}>Designed (min)</div></div>
          <div style={css.statC}><div style={css.statV}>{actualTime}</div><div style={css.statL}>Actual (min)</div></div>
          <div style={css.statC}><div style={{ ...css.statV, color: R }}>+{actualTime - designedTime}</div><div style={css.statL}>Downtime (min)</div></div>
        </div>
        {breakTime > 0 && (
          <div style={{ ...css.note, textAlign: "center", margin: "-6px 20px 8px" }}>
            Actual excludes {breakTime} min of breaks and non-working time — nights, Sundays and Saturday outside 08:00–13:00 (gross {grossTime} min).
          </div>
        )}

        <div style={css.card}>
          <div style={css.cardHd}>Root cause — 6Ms <span style={{ fontWeight: 400, textTransform: "none", opacity: .5, fontSize: 10, letterSpacing: 0 }}>(select all that apply)</span></div>
          <div style={css.sixGrid}>
            {SIX.map(m => <div key={m.m} style={{ ...css.mCard, ...(selMs.includes(m.m) ? css.mCardSel : {}) }} onClick={() => togM(m.m)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ fontSize: 18 }}>{m.icon}</span><div style={css.mTitle}>{m.m}</div></div>
              <div style={css.mSub}>{m.d}</div>
            </div>)}
          </div>

          {/* Custom causes — when the 6Ms don't cover it */}
          <div style={css.subSec}>
            <div style={css.subHd}>Other cause (not one of the 6Ms)</div>
            {customCauses.map(c => (
              <div key={c} style={{ ...css.mCard, ...(selMs.includes(c) ? css.mCardSel : {}), display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div onClick={() => togM(c)} style={{ flex: 1, cursor: "pointer" }}>
                  <div style={css.mTitle}>{c}</div>
                  <div style={css.mSub}>{selMs.includes(c) ? "Selected" : "Tap to select"}</div>
                </div>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: T.dimmer, fontSize: 16 }} onClick={() => removeCustomCause(c)}>×</button>
              </div>
            ))}
            <div style={css.addRow}>
              <input style={css.addInp} value={customCauseName} onChange={e => setCustomCauseName(e.target.value)} placeholder="Add another cause…"
                onKeyDown={e => e.key === "Enter" && addCustomCause(customCauseName)} />
              <button style={css.addBtn} onClick={() => addCustomCause(customCauseName)}>+ ADD</button>
            </div>
          </div>
        </div>

        {selMs.length > 0 && <div style={css.card}>
          <div style={css.cardHd}>Root cause detail <span style={{ fontWeight: 400, textTransform: "none", opacity: .5, fontSize: 10, letterSpacing: 0 }}>(add the delay each cause took)</span></div>
          {selMs.map(m => {
            const md = SIX.find(x => x.m === m);
            return (<div key={m} style={{ ...css.fld, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
              <label style={css.lbl_}>{m} — specific cause</label>
              {md ? (
                <select style={css.inp} value={subCauses[m] || ""} onChange={e => setSubCauses(p => ({ ...p, [m]: e.target.value }))}>
                  <option value="">Select…</option>
                  {md.subs.map(s => <option key={s}>{s}</option>)}
                  <option>Other (see comments)</option>
                </select>
              ) : (
                <input style={css.inp} value={subCauses[m] || ""} onChange={e => setSubCauses(p => ({ ...p, [m]: e.target.value }))} placeholder="Describe this cause…" />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <label style={{ ...css.lbl_, marginBottom: 0 }}>Delay caused</label>
                <input type="number" min="0" style={{ ...css.inp, maxWidth: 100 }} value={causeTimes[m] ?? ""} onChange={e => setCauseTimes(p => ({ ...p, [m]: e.target.value === "" ? "" : Number(e.target.value) }))} placeholder="min" />
                <span style={{ fontSize: 10, color: T.dim, fontFamily: T.mono }}>min</span>
              </div>
            </div>);
          })}
          {(() => {
            const summed = selMs.reduce((t, m) => t + (Number(causeTimes[m]) || 0), 0);
            const overrun = actualTime - designedTime;
            if (summed === 0) return null;
            return (
              <div style={{ ...css.note, marginTop: 6 }}>
                Causes account for {summed} min of the {overrun} min downtime
                {summed !== overrun ? ` (${summed > overrun ? "+" : "−"}${Math.abs(summed - overrun)} min vs total).` : "."}
              </div>
            );
          })()}
        </div>}

        <div style={css.card}>
          <div style={css.cardHd}>Response</div>
          <Inp label="Immediate corrective action taken" value={corrAction} onChange={e => setCorrAction(e.target.value)} placeholder="e.g. Re-allocated operators, sourced replacement material…" />
          <div style={css.fld}>
            <label style={css.lbl_}>Additional comments</label>
            <textarea style={css.ta} value={orComments} onChange={e => setOrComments(e.target.value)} placeholder="Further context, observations or follow-up actions…" />
          </div>
        </div>

        {/* ── CAPA Analysis (Phase 1 — KMC.DQHSE.02/26-PR0010) ── */}
        <div style={css.card}>
          <div style={{ ...css.cardHd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>CAPA Analysis</span>
            <span style={{ fontSize: 8, color: T.dimmer, fontFamily: T.mono, letterSpacing: "0.06em", textTransform: "none", fontWeight: 400 }}>KMC.DQHSE.02/26-PR0010</span>
          </div>

          {/* RCA Method */}
          <Sel label="RCA method" value={rcaMethod} onChange={e => setRcaMethod(e.target.value)}>
            <option value="">Select method…</option>
            <option value="5-Why">5-Why</option>
            <option value="8D">8D</option>
            <option value="Fishbone">Fishbone (Ishikawa)</option>
            <option value="DMAIC">DMAIC</option>
          </Sel>

          {/* 5M Category */}
          <Sel label="5M category (primary driver)" value={fiveCategory} onChange={e => setFiveCategory(e.target.value)}>
            <option value="">Select category…</option>
            <option value="Man">Man — Operator / skill / attendance</option>
            <option value="Machine">Machine — Equipment / tooling / fixtures</option>
            <option value="Method">Method — Process / sequence / instructions</option>
            <option value="Material">Material — Parts / consumables / supply</option>
            <option value="Measurement">Measurement — Inspection / gauging / data</option>
            <option value="Mother Nature">Mother Nature — Environment / power / temperature</option>
          </Sel>

          {/* 5-Why progressive inputs */}
          {rcaMethod === "5-Why" && (
            <div style={{ marginTop: 4 }}>
              <div style={{ ...css.subHd, marginBottom: 10 }}>5-Why drill-down</div>
              <div style={css.fld}>
                <label style={css.lbl_}>Why 1 — why did the downtime occur?</label>
                <input style={css.inp} value={why1} onChange={e => setWhy1(e.target.value)} placeholder="State the immediate cause…" />
              </div>
              {why1.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 2 — why did that happen?</label>
                  <input style={css.inp} value={why2} onChange={e => setWhy2(e.target.value)} placeholder="Dig one level deeper…" />
                </div>
              )}
              {why1.trim() && why2.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 3</label>
                  <input style={css.inp} value={why3} onChange={e => setWhy3(e.target.value)} placeholder="Continue…" />
                </div>
              )}
              {why1.trim() && why2.trim() && why3.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 4</label>
                  <input style={css.inp} value={why4} onChange={e => setWhy4(e.target.value)} placeholder="Continue…" />
                </div>
              )}
              {why1.trim() && why2.trim() && why3.trim() && why4.trim() && (
                <div style={css.fld}>
                  <label style={css.lbl_}>Why 5 — root cause</label>
                  <input style={css.inp} value={why5} onChange={e => setWhy5(e.target.value)} placeholder="Underlying root cause…" />
                </div>
              )}
            </div>
          )}

          {/* Preventive action */}
          <div style={{ ...css.fld, marginTop: 4 }}>
            <label style={css.lbl_}>Preventive action <span style={{ color: T.dimmer, fontWeight: 400 }}>(to stop recurrence)</span></label>
            <textarea style={css.ta} value={preventiveAction} onChange={e => setPreventiveAction(e.target.value)} placeholder="What systemic change will prevent this downtime from happening again?…" />
          </div>
        </div>

        {/* ── Evidence Attachment ── */}
        <div style={css.card}>
          <div style={css.cardHd}>Evidence attachment <span style={{ fontWeight: 400, textTransform: "none", opacity: .5, fontSize: 10, letterSpacing: 0 }}>(optional)</span></div>
          <div style={css.fld}>
            <label style={css.lbl_}>Photo or document showing cause / evidence</label>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              border: `1px dashed ${attachmentFile ? T.accent : T.border}`,
              borderRadius: 6, padding: "12px 14px",
              background: attachmentFile ? "rgba(220,38,38,0.06)" : T.inpBg,
              transition: "border-color .2s, background .2s",
            }}>
              <input
                type="file"
                accept="image/*,application/pdf"
                style={{ display: "none" }}
                onChange={handleAttachmentChange}
              />
              <span style={{ fontSize: 20 }}>{attachmentFile ? "📎" : "📁"}</span>
              <div>
                <div style={{ fontSize: 12, color: attachmentFile ? T.text : T.dim, fontWeight: attachmentFile ? 600 : 400 }}>
                  {attachmentFile ? attachmentFile.name : "Tap to select file…"}
                </div>
                {attachmentFile && (
                  <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>
                    {(attachmentFile.size / 1024).toFixed(0)} KB · {attachmentFile.type || "unknown type"}
                  </div>
                )}
                {!attachmentFile && (
                  <div style={{ fontSize: 10, color: T.dimmer, marginTop: 2 }}>Images (JPG, PNG) or PDF — max 5 MB</div>
                )}
              </div>
            </label>
            {attachmentFile && (
              <button
                style={{ ...css.btnS, marginTop: 8, fontSize: 10, padding: "5px 12px" }}
                onClick={() => { setAttachmentFile(null); setAttachmentB64(null); setAttachmentName(''); setAttachmentMime(''); }}
              >
                ✕ Remove
              </button>
            )}
            {/* Image preview */}
            {attachmentB64 && attachmentMime.startsWith("image/") && (
              <img
                src={attachmentB64}
                alt="Evidence preview"
                style={{ marginTop: 10, maxWidth: "100%", maxHeight: 180, borderRadius: 6, objectFit: "contain", border: `1px solid ${T.border}` }}
              />
            )}
          </div>
          <div style={{ ...css.note, marginTop: 4 }}>
            The file will be uploaded to Google Drive and the link saved alongside this downtime record.
          </div>
        </div>

        <div style={css.nav2}>
          <button style={{ ...css.btnS, marginTop: 0, flex: .35 }} onClick={() => goTo(1)}>← Back</button>
          <button style={{ ...css.btnP, marginTop: 0, flex: 1 }} onClick={() => goTo(3)}>Continue to sign-off →</button>
        </div>
      </>}

      {/* ── PAGE 3: SIGN-OFF ── */}
      {page === 3 && <>
        <div style={css.card}>
          {/* change 7: no designation field */}
          <div style={css.cardHd}>Reviewer sign-off</div>
          <div style={css.fld}>
            <label style={css.lbl_}>Reviewer name</label>
            <select style={css.inp} value={reviewer} onChange={e => setReviewer(e.target.value)}>
              <option value="">Select reviewer…</option>
              {reviewers.map(r => <option key={r}>{r}</option>)}
              <option value="__other__">Other (type name)</option>
            </select>
            {reviewer === "__other__" && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <input style={css.inp} value={revOther} onChange={e => setRevOther(e.target.value)} placeholder="Enter reviewer name…" />
                {revOther.trim() && !reviewers.includes(revOther.trim()) && (
                  <button style={css.addBtn} onClick={() => { const n = revOther.trim(); setReviewers(prev => [...prev, n]); setReviewer(n); }}>+ SAVE TO REVIEWER LIST</button>
                )}
              </div>
            )}
            {reviewers.length > 0 && (
              <div style={css.tagRow}>
                {reviewers.map(r => <Tag key={r} label={r} onDel={() => { setReviewers(prev => prev.filter(x => x !== r)); if (reviewer === r) setReviewer(""); }} />)}
              </div>
            )}
          </div>
          <div style={css.g2}>
            <Sel label="Approval status" value={appStatus} onChange={e => setAppStatus(e.target.value)}>
              <option value="">Select…</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending review</option>
              <option value="rejected">Rejected / Rework required</option>
            </Sel>
            <Inp label="Review date" type="date" value={revDate} onChange={e => setRevDate(e.target.value)} />
          </div>
          <Inp label="Comments (optional)" value={revComments} onChange={e => setRevComments(e.target.value)} placeholder="Any notes from the reviewer…" />
        </div>

        <div style={css.nav2}>
          <button style={{ ...css.btnS, marginTop: 0, flex: .35 }} onClick={() => goTo(hasDowntime ? 2 : 1)}>← Back</button>
          <button style={{ ...css.btnP, marginTop: 0, flex: 1 }} onClick={submit}>Submit travel card</button>
        </div>
      </>}

      {/* ── PAGE 4: DONE ── */}
      {page === 4 && submission && <>
        <div style={css.card}>
          <div style={{ textAlign: "center", padding: "12px 0 6px" }}>
            <div style={{ fontSize: 42, color: isEditMode ? GR : submission.approvalStatus === "pending_review" ? AM : GR }}>
              {isEditMode ? "✓" : submission.approvalStatus === "pending_review" ? "⏳" : "✓"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", marginTop: 8, textTransform: "uppercase" }}>
              {isEditMode ? "Changes saved" : submission.approvalStatus === "pending_review" ? "Submitted — Pending Review" : "Travel card submitted"}
            </div>
            {!isEditMode && submission.approvalStatus === "pending_review" && (
              <div style={{ fontSize: 12, color: AM, marginTop: 6, fontFamily: T.mono }}>
                Your supervisor will review this submission.
              </div>
            )}
            <div style={{ fontSize: 10, color: T.dimmer, fontFamily: T.mono, marginTop: 5 }}>{new Date(submission.timestamp).toLocaleString()}</div>
          </div>
        </div>

        <div style={css.confC}>
          <div style={css.cardHd}>Station summary</div>
          {[
            ["Project", submission.project],
            ["Bus model", submission.busModel],
            ["VIN", submission.vin],
            ["Line", submission.line],
            ["Station", submission.stationCode],
            ["Operators", submission.operators.join(", ") || "—"],
            ["Clock in", submission.clockIn ? new Date(submission.clockIn).toLocaleTimeString() : "—"],
            ["Clock out", submission.clockOut ? new Date(submission.clockOut).toLocaleTimeString() : "—"],
            ["Actual time", `${submission.actualTime} min`],
            ...(submission.breakMinutes > 0 ? [["Breaks excluded", `${submission.breakMinutes} min (gross ${submission.grossTime} min)`]] : []),
            ...(!isUser ? [["Designed time", `${submission.designedTime} min`]] : []),
            ...(!isUser ? [["Approval", submission.approvalStatus], ["Reviewer", submission.reviewer]] : []),
          ].map(([l, v]) => <div key={l} style={css.confRow}><span style={css.confLbl}>{l}</span><span style={css.confVal}>{v || "—"}</span></div>)}
        </div>

        {/* Activities summary */}
        {(() => {
          const entries = Object.entries(submission.activityStatuses || {});
          const added = submission.addedActivities || [];
          if (entries.length === 0 && added.length === 0) return null;
          const statusLabel = { complete: "✅ Complete", incomplete: "⏳ Incomplete", issue: "⚠️ Issue noted", rework: "🔁 Rework needed", na: "— N/A" };
          return (
            <div style={css.confC}>
              <div style={css.cardHd}>Activities</div>
              {entries.map(([a, s]) => (
                <div key={a} style={css.confRow}>
                  <span style={css.confLbl}>{a}</span>
                  <span style={css.confVal}>{statusLabel[s] || s}</span>
                </div>
              ))}
              {added.map(a => (
                <div key={a} style={css.confRow}>
                  <span style={css.confLbl}>{a}</span>
                  <span style={{ ...css.confVal, color: T.dim }}>{statusLabel[submission.activityStatuses?.[a]] || "—"}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Consumables summary */}
        {(() => {
          const presets = Object.entries(submission.resourcesUsed || {}).filter(([, v]) => v !== "" && v !== undefined);
          const custom = submission.otherResources || [];
          const removed = submission.removedResources || [];
          if (presets.length === 0 && custom.length === 0 && removed.length === 0) return null;
          return (
            <div style={css.confC}>
              <div style={css.cardHd}>Consumables & Materials</div>
              {presets.map(([r, qty]) => (
                <div key={r} style={css.confRow}>
                  <span style={css.confLbl}>{r}</span>
                  <span style={css.confVal}>×{qty}</span>
                </div>
              ))}
              {custom.map((r, i) => (
                <div key={i} style={css.confRow}>
                  <span style={css.confLbl}>{r.name}</span>
                  <span style={css.confVal}>×{r.qty}</span>
                </div>
              ))}
              {removed.map(r => (
                <div key={r} style={css.confRow}>
                  <span style={{ ...css.confLbl, color: T.dimmer, textDecoration: "line-through" }}>{r}</span>
                  <span style={{ ...css.confVal, color: T.dimmer }}>Not used</span>
                </div>
              ))}
            </div>
          );
        })()}

        {(submission.generalComments || submission.unexpectedDelay) && <div style={css.confC}>
          <div style={css.cardHd}>Additional notes</div>
          {submission.generalComments && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Comments</span>
              <span style={css.confVal}>{submission.generalComments}</span>
            </div>
          )}
          {submission.unexpectedDelay?.types?.map(t => (
            <div key={t} style={css.confRow}>
              <span style={css.confLbl}>{t}</span>
              <span style={{ ...css.confVal, color: AM }}>
                {submission.unexpectedDelay.ranges?.[t] ? `${submission.unexpectedDelay.ranges[t].replace("-", "–")} min` : "flagged"}
              </span>
            </div>
          ))}
        </div>}

        {/* change 9: downtime details on done page */}
        {submission.hasDowntime && <div style={{ ...css.confC, background: RA, border: `1px solid ${RB}` }}>
          <div style={{ ...css.cardHd, color: R, borderColor: RB }}>Downtime details</div>
          <div style={css.stat3}>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: T.text }}>{submission.designedTime}</div><div style={css.statL}>Designed (min)</div></div>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: T.text }}>{submission.actualTime}</div><div style={css.statL}>Actual (min)</div></div>
            <div style={{ ...css.statC, background: "rgba(220,38,38,0.08)" }}><div style={{ ...css.statV, color: R }}>+{submission.actualTime - submission.designedTime}</div><div style={css.statL}>Downtime (min)</div></div>
          </div>
          {submission.downtime?.selMs?.length > 0 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Root causes</span>
              <span style={{ ...css.confVal, color: AM }}>{submission.downtime.selMs.join(", ")}</span>
            </div>
          )}
          {submission.downtime?.selMs?.map((m) => {
            const detail = submission.downtime.subCauses?.[m];
            const mins = submission.downtime.causeTimes?.[m];
            if (!detail && (mins === undefined || mins === "")) return null;
            return (
              <div key={m} style={css.confRow}>
                <span style={css.confLbl}>{m}</span>
                <span style={css.confVal}>{detail || "—"}{(mins !== undefined && mins !== "") ? ` · ${mins} min` : ""}</span>
              </div>
            );
          })}
          {submission.downtime?.correctiveAction && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Corrective action</span>
              <span style={css.confVal}>{submission.downtime.correctiveAction}</span>
            </div>
          )}
          {submission.downtime?.comments && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Comments</span>
              <span style={css.confVal}>{submission.downtime.comments}</span>
            </div>
          )}
          {submission.downtime?.rcaMethod && (
            <div style={css.confRow}>
              <span style={css.confLbl}>RCA method</span>
              <span style={css.confVal}>{submission.downtime.rcaMethod}</span>
            </div>
          )}
          {submission.downtime?.category && (
            <div style={css.confRow}>
              <span style={css.confLbl}>5M category</span>
              <span style={css.confVal}>{submission.downtime.category}</span>
            </div>
          )}
          {submission.downtime?.why1 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 1</span>
              <span style={css.confVal}>{submission.downtime.why1}</span>
            </div>
          )}
          {submission.downtime?.why2 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 2</span>
              <span style={css.confVal}>{submission.downtime.why2}</span>
            </div>
          )}
          {submission.downtime?.why3 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 3</span>
              <span style={css.confVal}>{submission.downtime.why3}</span>
            </div>
          )}
          {submission.downtime?.why4 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 4</span>
              <span style={css.confVal}>{submission.downtime.why4}</span>
            </div>
          )}
          {submission.downtime?.why5 && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Why 5 (root cause)</span>
              <span style={css.confVal}>{submission.downtime.why5}</span>
            </div>
          )}
          {submission.downtime?.preventiveAction && (
            <div style={css.confRow}>
              <span style={css.confLbl}>Preventive action</span>
              <span style={css.confVal}>{submission.downtime.preventiveAction}</span>
            </div>
          )}
        </div>}

        <div style={{ fontSize: 11, textAlign: "center", color: T.dim, fontFamily: T.mono, marginBottom: 8 }}>{gsStatus}</div>
        {emailStatus && <div style={{ fontSize: 11, textAlign: "center", color: T.dim, fontFamily: T.mono, margin: "-4px 20px 8px" }}>{emailStatus}</div>}

        {/* change 10: two PDF download buttons */}
        <div style={css.px}>
          <button style={{ ...css.btnDl, opacity: dlBusy === "station" ? 0.6 : 1 }} onClick={dlStationReport} disabled={!!dlBusy}>
            {dlBusy === "station" ? "Generating PDF…" : "⬇ Download station report (PDF)"}
          </button>
          <button style={{ ...css.btnDl, opacity: dlBusy === "bus" ? 0.6 : 1 }} onClick={dlBusReport} disabled={!!dlBusy}>
            {dlBusy === "bus" ? "Generating PDF…" : "⬇ Download full bus report (PDF)"}
          </button>
          <button style={css.btnP} onClick={another}>Log another station →</button>
          <button style={css.btnS} onClick={() => { if (onReset) onReset(); if (onExit) onExit(); }}>{onExit ? "← Back to Travel Card home" : "← Back to tracker"}</button>
        </div>
      </>}
    </div>
    </div>
  );
}

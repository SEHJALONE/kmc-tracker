const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

// ── helpers ──────────────────────────────────────────────────────────────────
const imgPath = (f) => path.join("C:\\Users\\KMC-PC\\kmc-tracker", f);
const makeShadow = () => ({ type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.14 });
const makeCardShadow = () => ({ type: "outer", color: "000000", blur: 12, offset: 4, angle: 135, opacity: 0.12 });

// ── palette ───────────────────────────────────────────────────────────────────
const RED       = "CC0000";
const DARK      = "0F172A";
const DARK2     = "1E293B";
const SLATE     = "334155";
const MUTED     = "64748B";
const LIGHT_BG  = "F8FAFC";
const WHITE     = "FFFFFF";
const LIGHT_RED = "FFF0F0";
const ACCENT2   = "E2E8F0";

// ── pres setup ────────────────────────────────────────────────────────────────
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10" × 5.625"
pres.title  = "KMC Bus Production Tracker";
pres.author = "Kiira Motors Corporation";

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: DARK };

  // Full-bleed subtle pattern: layered rectangles for depth
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 4.4, w: 10, h: 1.225, fill: { color: "161D2F" }, line: { color: "161D2F" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 3.5, h: 5.625, fill: { color: "0A0F1E", transparency: 0 }, line: { color: "0A0F1E" } });

  // Red accent shape (top-right corner block)
  s.addShape(pres.shapes.RECTANGLE, { x: 6.8, y: 0, w: 3.2, h: 0.1, fill: { color: RED }, line: { color: RED } });

  // Logo
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.45, y: 0.5, w: 2.5, h: 0.7 });

  // Tagline under logo
  s.addText("MISSION VEHICLES · MADE IN UGANDA", {
    x: 0.45, y: 1.3, w: 2.8, h: 0.25,
    fontSize: 7, color: MUTED, charSpacing: 2, fontFace: "Calibri", bold: false
  });

  // Vertical divider
  s.addShape(pres.shapes.RECTANGLE, { x: 3.6, y: 0.4, w: 0.02, h: 4.8, fill: { color: "FFFFFF", transparency: 85 }, line: { color: "FFFFFF", transparency: 85 } });

  // Main title
  s.addText("BUS PRODUCTION\nTRACKER", {
    x: 3.9, y: 1.0, w: 5.8, h: 2.2,
    fontSize: 48, fontFace: "Georgia", bold: true, color: WHITE,
    lineSpacingMultiple: 1.05
  });

  // Red underline
  s.addShape(pres.shapes.RECTANGLE, { x: 3.9, y: 3.2, w: 1.2, h: 0.06, fill: { color: RED }, line: { color: RED } });

  // Subtitle
  s.addText("Digital Production Tracking System\nKiira Motors Corporation", {
    x: 3.9, y: 3.4, w: 5.8, h: 0.85,
    fontSize: 15, fontFace: "Calibri", color: "94A3B8", lineSpacingMultiple: 1.4
  });

  // Footer
  s.addText("KMC BUS PRODUCTION TRACKER  ·  FEATURE OVERVIEW", {
    x: 3.9, y: 5.2, w: 5.8, h: 0.25,
    fontSize: 7.5, fontFace: "Calibri", color: MUTED, charSpacing: 1.5
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — SYSTEM OVERVIEW (home screen screenshot)
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };

  // Header band
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: WHITE }, line: { color: WHITE } });

  // Logo
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.4, y: 0.18, w: 1.8, h: 0.5 });

  // Slide title
  s.addText("System Overview", {
    x: 2.5, y: 0.18, w: 5, h: 0.5,
    fontSize: 22, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  s.addText("Two integrated modules driving production visibility", {
    x: 2.5, y: 0.65, w: 7, h: 0.3,
    fontSize: 11, fontFace: "Calibri", color: MUTED, margin: 0
  });

  // Home screen screenshot - centred, large
  s.addImage({
    path: imgPath("ppt_after_login.png"),
    x: 1.0, y: 1.2, w: 8.0, h: 4.0,
    shadow: makeCardShadow()
  });

  // Two callout labels below
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.6, y: 5.0, w: 2.2, h: 0.4, fill: { color: DARK }, line: { color: DARK }, rectRadius: 0.05 });
  s.addText("TRAVEL CARD", { x: 1.6, y: 5.0, w: 2.2, h: 0.4, fontSize: 9, fontFace: "Calibri", bold: true, color: WHITE, align: "center", valign: "middle" });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.2, y: 5.0, w: 2.2, h: 0.4, fill: { color: RED }, line: { color: RED }, rectRadius: 0.05 });
  s.addText("BUS TRACKER", { x: 6.2, y: 5.0, w: 2.2, h: 0.4, fontSize: 9, fontFace: "Calibri", bold: true, color: WHITE, align: "center", valign: "middle" });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — LINE TRACKER
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };

  // Header
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.4, y: 0.18, w: 1.8, h: 0.5 });

  // Red tab
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 2.4, y: 0.2, w: 1.3, h: 0.35, fill: { color: RED }, line: { color: RED }, rectRadius: 0.05 });
  s.addText("BUS TRACKER", { x: 2.4, y: 0.2, w: 1.3, h: 0.35, fontSize: 7.5, fontFace: "Calibri", bold: true, color: WHITE, align: "center", valign: "middle" });

  s.addText("Line Tracker", {
    x: 3.9, y: 0.15, w: 5, h: 0.42,
    fontSize: 22, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  s.addText("Live floor map — every bus at its current station across all production lines", {
    x: 3.9, y: 0.62, w: 5.8, h: 0.3,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, margin: 0
  });

  // Left screenshot: top view
  s.addImage({
    path: imgPath("ppt_line_tracker_top.png"),
    x: 0.25, y: 1.15, w: 5.35, h: 3.2,
    shadow: makeCardShadow()
  });

  // Right screenshot: bus cards
  s.addImage({
    path: imgPath("ppt_line_tracker_buses.png"),
    x: 5.8, y: 1.15, w: 3.95, h: 3.2,
    shadow: makeCardShadow()
  });

  // Feature bullets at bottom
  const features = [
    "9 production lines tracked",
    "Filter by model, project, station, status & date",
    "Bus cards show model, VIN & current station",
    "Overrun & status badges at a glance",
  ];
  features.forEach((f, i) => {
    const col = i < 2 ? 0 : 1;
    const row = i % 2;
    s.addShape(pres.shapes.OVAL, { x: 0.3 + col * 4.95, y: 4.52 + row * 0.4, w: 0.12, h: 0.12, fill: { color: RED }, line: { color: RED } });
    s.addText(f, {
      x: 0.52 + col * 4.95, y: 4.47 + row * 0.4, w: 4.3, h: 0.3,
      fontSize: 9.5, fontFace: "Calibri", color: DARK2, valign: "middle", margin: 0
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };

  // Header
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.4, y: 0.18, w: 1.8, h: 0.5 });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 2.4, y: 0.2, w: 1.3, h: 0.35, fill: { color: RED }, line: { color: RED }, rectRadius: 0.05 });
  s.addText("BUS TRACKER", { x: 2.4, y: 0.2, w: 1.3, h: 0.35, fontSize: 7.5, fontFace: "Calibri", bold: true, color: WHITE, align: "center", valign: "middle" });

  s.addText("Dashboard", {
    x: 3.9, y: 0.15, w: 5, h: 0.42,
    fontSize: 22, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  s.addText("Aggregate metrics — throughput, takt time, overruns, OHS and rework", {
    x: 3.9, y: 0.62, w: 5.8, h: 0.3,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, margin: 0
  });

  // Full dashboard screenshot
  s.addImage({
    path: imgPath("ppt_dashboard.png"),
    x: 0.25, y: 1.15, w: 9.5, h: 3.5,
    shadow: makeCardShadow()
  });

  // KPI callouts
  const kpis = [
    { label: "TOTAL ON FLOOR", value: "22 Buses" },
    { label: "KDC UNITS",      value: "14" },
    { label: "EVS UNITS",      value: "8" },
    { label: "PROD. RATE",     value: "0.0/day" },
  ];
  const kw = 2.1, kx0 = 0.25;
  kpis.forEach((k, i) => {
    const kx = kx0 + i * (kw + 0.12);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: kx, y: 4.82, w: kw, h: 0.65, fill: { color: WHITE }, line: { color: ACCENT2 }, rectRadius: 0.07, shadow: makeShadow() });
    s.addText(k.label, { x: kx, y: 4.83, w: kw, h: 0.25, fontSize: 7, fontFace: "Calibri", color: MUTED, align: "center", charSpacing: 0.5 });
    s.addText(k.value, { x: kx, y: 5.06, w: kw, h: 0.32, fontSize: 14, fontFace: "Georgia", bold: true, color: RED, align: "center", margin: 0 });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — BUS REPORT
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };

  // Header
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.4, y: 0.18, w: 1.8, h: 0.5 });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 2.4, y: 0.2, w: 1.3, h: 0.35, fill: { color: RED }, line: { color: RED }, rectRadius: 0.05 });
  s.addText("BUS TRACKER", { x: 2.4, y: 0.2, w: 1.3, h: 0.35, fontSize: 7.5, fontFace: "Calibri", bold: true, color: WHITE, align: "center", valign: "middle" });

  s.addText("Bus Report", {
    x: 3.9, y: 0.15, w: 5, h: 0.42,
    fontSize: 22, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  s.addText("Per-bus breakdown — station times, progress, delays and bottleneck detection", {
    x: 3.9, y: 0.62, w: 5.8, h: 0.3,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, margin: 0
  });

  // Screenshot left
  s.addImage({
    path: imgPath("ppt_bus_report.png"),
    x: 0.25, y: 1.15, w: 6.2, h: 3.6,
    shadow: makeCardShadow()
  });

  // Feature list right
  const feats = [
    { icon: "●", text: "Per-bus station-by-station time breakdown" },
    { icon: "●", text: "ON TRACK / SLOW / DELAYED status flags" },
    { icon: "●", text: "Average time variance vs. estimate" },
    { icon: "●", text: "Progress % at each station" },
    { icon: "●", text: "First-entry date and total cumulative time" },
    { icon: "●", text: "Export to Excel, PDF or Slide deck" },
  ];
  s.addText("What you can see:", {
    x: 6.7, y: 1.2, w: 3.0, h: 0.35,
    fontSize: 13, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  feats.forEach((f, i) => {
    s.addShape(pres.shapes.OVAL, { x: 6.7, y: 1.72 + i * 0.47, w: 0.1, h: 0.1, fill: { color: RED }, line: { color: RED } });
    s.addText(f.text, {
      x: 6.88, y: 1.67 + i * 0.47, w: 2.9, h: 0.38,
      fontSize: 9.5, fontFace: "Calibri", color: DARK2, margin: 0, valign: "middle"
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — TRAVEL CARD
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };

  // Header
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.4, y: 0.18, w: 1.8, h: 0.5 });

  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 2.4, y: 0.2, w: 1.4, h: 0.35, fill: { color: DARK2 }, line: { color: DARK2 }, rectRadius: 0.05 });
  s.addText("TRAVEL CARD", { x: 2.4, y: 0.2, w: 1.4, h: 0.35, fontSize: 7.5, fontFace: "Calibri", bold: true, color: WHITE, align: "center", valign: "middle" });

  s.addText("Production Travel Card", {
    x: 3.9, y: 0.15, w: 5.8, h: 0.42,
    fontSize: 22, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  s.addText("Guided multi-step form for submitting station data, clock-in/out, and overrun capture", {
    x: 3.9, y: 0.62, w: 5.8, h: 0.3,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, margin: 0
  });

  // Travel Card screenshot
  s.addImage({
    path: imgPath("ppt_travel_card.png"),
    x: 0.25, y: 1.15, w: 5.7, h: 3.6,
    shadow: makeCardShadow()
  });

  // Workflow steps
  s.addText("5-Step Workflow", {
    x: 6.2, y: 1.2, w: 3.5, h: 0.35,
    fontSize: 13, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });

  const steps = [
    { n: "1", label: "Identity",  desc: "Select project, bus model & VIN" },
    { n: "2", label: "Activities", desc: "Log tasks, resources & clock-in" },
    { n: "3", label: "Overrun",    desc: "Capture delays with root cause" },
    { n: "4", label: "Sign-Off",   desc: "Station completion confirmation" },
    { n: "5", label: "Done",       desc: "Submit to Google Sheets via Apps Script" },
  ];
  steps.forEach((st, i) => {
    const sy = 1.7 + i * 0.68;
    // Number circle
    s.addShape(pres.shapes.OVAL, { x: 6.2, y: sy, w: 0.38, h: 0.38, fill: { color: RED }, line: { color: RED } });
    s.addText(st.n, { x: 6.2, y: sy, w: 0.38, h: 0.38, fontSize: 11, fontFace: "Georgia", bold: true, color: WHITE, align: "center", valign: "middle" });
    s.addText(st.label, {
      x: 6.72, y: sy, w: 3.0, h: 0.2,
      fontSize: 11, fontFace: "Calibri", bold: true, color: DARK2, margin: 0
    });
    s.addText(st.desc, {
      x: 6.72, y: sy + 0.19, w: 3.0, h: 0.19,
      fontSize: 8.5, fontFace: "Calibri", color: MUTED, margin: 0
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — EXPORT & SHARING
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };

  // Header
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.4, y: 0.18, w: 1.8, h: 0.5 });
  s.addText("Export & Sharing", {
    x: 2.4, y: 0.15, w: 5, h: 0.42,
    fontSize: 22, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  s.addText("Multiple formats to share production data with stakeholders", {
    x: 2.4, y: 0.62, w: 7, h: 0.3,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, margin: 0
  });

  // Export option cards — 2 × 3 grid
  const exports = [
    { title: "Excel Workbook",   desc: "Full bus data and station records in .xlsx",    color: "1D6F42" },
    { title: "PDF Report",       desc: "Formatted multi-page production status report",  color: RED },
    { title: "Slide PDF",        desc: "Slide-format summary ready for presentation",    color: "0F4C81" },
    { title: "PNG Export",       desc: "Quick image snapshot of current view",           color: "7E3AF2" },
    { title: "Email Report",     desc: "Scheduled or on-demand email to recipients",     color: "C05621" },
    { title: "Travel Card PDF",  desc: "Printable PDF of the per-bus travel card",       color: "065A82" },
  ];

  const cols = 3, rows = 2;
  const cw = 2.9, ch = 1.6, cx0 = 0.35, cy0 = 1.25, gap = 0.22;

  exports.forEach((ex, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = cx0 + col * (cw + gap);
    const cy = cy0 + row * (ch + gap);

    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: cy, w: cw, h: ch,
      fill: { color: WHITE }, line: { color: ACCENT2 },
      rectRadius: 0.1, shadow: makeShadow()
    });
    // Colored top accent circle
    s.addShape(pres.shapes.OVAL, { x: cx + 0.22, y: cy + 0.2, w: 0.45, h: 0.45, fill: { color: ex.color }, line: { color: ex.color } });
    s.addText(ex.title, {
      x: cx + 0.15, y: cy + 0.73, w: cw - 0.3, h: 0.35,
      fontSize: 12, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
    });
    s.addText(ex.desc, {
      x: cx + 0.15, y: cy + 1.1, w: cw - 0.3, h: 0.4,
      fontSize: 9, fontFace: "Calibri", color: MUTED, margin: 0
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — ROLE-BASED ACCESS & ADMIN FEATURES
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: LIGHT_BG };

  // Header
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: WHITE }, line: { color: WHITE } });
  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.4, y: 0.18, w: 1.8, h: 0.5 });
  s.addText("Roles & Administration", {
    x: 2.4, y: 0.15, w: 5.5, h: 0.42,
    fontSize: 22, fontFace: "Georgia", bold: true, color: DARK2, margin: 0
  });
  s.addText("Two access tiers — everyone can submit data; admins manage the catalog", {
    x: 2.4, y: 0.62, w: 7, h: 0.3,
    fontSize: 10.5, fontFace: "Calibri", color: MUTED, margin: 0
  });

  // Two large cards side by side
  const cards = [
    {
      role: "USER",
      color: DARK2,
      bg: "F0F4FF",
      items: [
        "Submit Travel Card data for any station",
        "View Live Line Tracker & bus positions",
        "Browse Bus Reports & Dashboard",
        "Filtered views by model, project, line",
        "Export reports to PDF / Excel / PNG",
      ]
    },
    {
      role: "ADMIN",
      color: RED,
      bg: "FFF0F0",
      items: [
        "All User capabilities, plus:",
        "Edit Catalog (projects, lines, stations, activities, resources)",
        "Adjust clock-out times on Travel Cards",
        "Archive or deprecate catalog entries",
        "Manage shared Google Sheets data source",
      ]
    }
  ];

  cards.forEach((card, i) => {
    const cx = 0.35 + i * 4.95;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: 1.2, w: 4.55, h: 4.15,
      fill: { color: WHITE }, line: { color: ACCENT2 },
      rectRadius: 0.12, shadow: makeCardShadow()
    });
    // Role badge
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx + 0.25, y: 1.35, w: 1.1, h: 0.42, fill: { color: card.color }, line: { color: card.color }, rectRadius: 0.08 });
    s.addText(card.role, { x: cx + 0.25, y: 1.35, w: 1.1, h: 0.42, fontSize: 11, fontFace: "Calibri", bold: true, color: WHITE, align: "center", valign: "middle" });

    card.items.forEach((item, j) => {
      s.addShape(pres.shapes.OVAL, { x: cx + 0.27, y: 1.98 + j * 0.56, w: 0.11, h: 0.11, fill: { color: card.color }, line: { color: card.color } });
      s.addText(item, {
        x: cx + 0.46, y: 1.93 + j * 0.56, w: 4.0, h: 0.48,
        fontSize: 10, fontFace: "Calibri", color: j === 0 && i === 1 ? card.color : DARK2,
        bold: j === 0 && i === 1, margin: 0, valign: "middle"
      });
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — CLOSING
// ═════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: DARK };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 3.5, h: 5.625, fill: { color: "0A0F1E" }, line: { color: "0A0F1E" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 6.8, y: 0, w: 3.2, h: 0.1, fill: { color: RED }, line: { color: RED } });

  s.addImage({ path: imgPath("public/kmc logo.png"), x: 0.45, y: 0.5, w: 2.5, h: 0.7 });
  s.addShape(pres.shapes.RECTANGLE, { x: 3.6, y: 0.4, w: 0.02, h: 4.8, fill: { color: "FFFFFF", transparency: 85 }, line: { color: "FFFFFF", transparency: 85 } });

  s.addText("Built for\nthe factory floor.", {
    x: 3.9, y: 0.9, w: 5.8, h: 1.8,
    fontSize: 42, fontFace: "Georgia", bold: true, color: WHITE, lineSpacingMultiple: 1.1
  });
  s.addShape(pres.shapes.RECTANGLE, { x: 3.9, y: 2.65, w: 1.0, h: 0.06, fill: { color: RED }, line: { color: RED } });

  const summary = [
    "Real-time bus positions across 9 production lines",
    "Per-bus station timing, delays and progress tracking",
    "Guided travel card data entry with overrun capture",
    "Dashboard KPIs and exportable reports",
    "Role-based access with admin catalog management",
  ];
  summary.forEach((line, i) => {
    s.addShape(pres.shapes.OVAL, { x: 3.9, y: 2.87 + i * 0.45, w: 0.1, h: 0.1, fill: { color: RED }, line: { color: RED } });
    s.addText(line, {
      x: 4.1, y: 2.83 + i * 0.45, w: 5.6, h: 0.38,
      fontSize: 10, fontFace: "Calibri", color: "CBD5E1", margin: 0, valign: "middle"
    });
  });

  s.addText("KIIRA MOTORS CORPORATION  ·  MISSION VEHICLES MADE IN UGANDA", {
    x: 3.9, y: 5.2, w: 5.8, h: 0.25,
    fontSize: 7.5, fontFace: "Calibri", color: MUTED, charSpacing: 1.2
  });
}

// ── write ─────────────────────────────────────────────────────────────────────
pres.writeFile({ fileName: "KMC_Bus_Production_Tracker.pptx" })
  .then(() => console.log("✓ KMC_Bus_Production_Tracker.pptx written"))
  .catch(e => { console.error(e); process.exit(1); });

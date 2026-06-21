const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, TableOfContents, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak, Header, Footer, VerticalAlign,
} = require('docx');

// ── Palette ──────────────────────────────────────────────
const KMC_RED = "C8102E";
const DARK = "1E293B";
const GREY = "475569";
const NOTE_BG = "F1F5F9";
const HEAD_BG = "C8102E";
const ZEBRA = "F6F8FA";
const FORM_BG = "EEF2F7";

const FONT = "Times New Roman";
const SZ_BODY = 24;   // 12pt
const SZ_H1 = 28;     // 14pt
const SZ_H2 = 24;     // 12pt
const SZ_H3 = 24;     // 12pt

// Indents (twips). 1 cm = 567, 1.5 cm = 850
const GAP_1CM = 567;
const GAP_15CM = 850;

// ── Helpers ──────────────────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 1, color: "C7CDD4" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 50, bottom: 50, left: 110, right: 110 };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, numbering: { reference: "headings", level: 0 },
    alignment: AlignmentType.JUSTIFIED, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, numbering: { reference: "headings", level: 1 },
    alignment: AlignmentType.JUSTIFIED, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, numbering: { reference: "headings", level: 2 },
    alignment: AlignmentType.JUSTIFIED, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, ...opts })] });
}
function bullet(text, level = 0) {
  return new Paragraph({ numbering: { reference: "bullets", level },
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 264 },
    children: typeof text === 'string' ? [new TextRun(text)] : text });
}
function num(text, level = 0) {
  return new Paragraph({ numbering: { reference: "steps", level },
    alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 264 },
    children: typeof text === 'string' ? [new TextRun(text)] : text });
}
function note(text) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 160 },
    shading: { fill: NOTE_BG, type: ShadingType.CLEAR },
    children: [new TextRun({ text: "Note:  ", bold: true, color: KMC_RED }),
               new TextRun({ text, color: GREY })] });
}
function formula(text) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 120 },
    shading: { fill: FORM_BG, type: ShadingType.CLEAR },
    children: [new TextRun({ text, bold: true, color: "0F172A" })] });
}

// Table builder
function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((hd, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: HEAD_BG, type: ShadingType.CLEAR },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: hd, bold: true, color: "FFFFFF" })] })],
    })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: ri % 2 ? ZEBRA : "FFFFFF", type: ShadingType.CLEAR },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      children: String(c).split("\n").map(line =>
        new Paragraph({ children: [new TextRun({ text: line, color: DARK })] })),
    })),
  }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [headRow, ...bodyRows] });
}

const children = [];

// ════════════════════════════════════════════════════════
// COVER
// ════════════════════════════════════════════════════════
children.push(
  new Paragraph({ spacing: { before: 2400, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "KIIRA MOTORS CORPORATION", bold: true, size: 30, color: KMC_RED })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: KMC_RED, space: 12 } },
    children: [new TextRun({ text: "", size: 2 })] }),
  new Paragraph({ spacing: { before: 560, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Bus Production Tracker", bold: true, size: 64, color: DARK })] }),
  new Paragraph({ spacing: { before: 160, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "USER MANUAL", bold: true, size: 36, color: KMC_RED })] }),
  new Paragraph({ spacing: { before: 220, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Version 2.0", bold: true, size: 30, color: DARK })] }),
  new Paragraph({ spacing: { before: 100, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Updated for roles & access, the shared catalog, in-app help, production-time accounting, the takt-time and overrun root-cause dashboards, and scheduled email reporting", italics: true, size: 22, color: GREY })] }),
  // Version retention note
  new Paragraph({ spacing: { before: 820, after: 0 }, alignment: AlignmentType.CENTER,
    shading: { fill: NOTE_BG, type: ShadingType.CLEAR },
    children: [new TextRun({ text: "This is a later edition (Version 2.0). The previous edition, Version 1.0, has NOT been deleted — it is retained separately as ", size: 20, color: GREY }),
               new TextRun({ text: "KMC_Bus_Production_Tracker_User_Manual.docx", bold: true, size: 20, color: DARK }),
               new TextRun({ text: ". This Version 2.0 file is named KMC_Bus_Production_Tracker_User_Manual_v2.docx.", size: 20, color: GREY })] }),
  new Paragraph({ spacing: { before: 680, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Document reference: KMC.DPN.05/26-FM004  ·  Manual Rev 2.0", size: 20, color: GREY })] }),
  new Paragraph({ spacing: { before: 100, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Models supported: KDC (diesel) and EVS (electric)", size: 20, color: GREY })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// TOC
children.push(
  new Paragraph({ spacing: { after: 160 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Table of Contents", bold: true, size: SZ_H1, color: KMC_RED })] }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({ children: [new PageBreak()] }),
);

// ════════════════════════════════════════════════════════
// 1 INTRODUCTION
// ════════════════════════════════════════════════════════
children.push(h1("Introduction"));
children.push(p("The Bus Production Tracker is a web-based system used to monitor the assembly of buses across the Kiira Motors Corporation (KMC) production plant in real time, to capture production data at every station, and to turn that data into performance, quality and downtime analytics. It supports two bus families: KDC (diesel; 10.5 m and 12 m) and EVS (electric; 7 m, 8.5 m, 10.5 m and 12 m). A third family, KEC, is listed but its templates are not yet available."));

children.push(h2("What is new in Version 2.0"));
children.push(p("This edition documents features introduced after the first manual was issued:"));
children.push(bullet([new TextRun({ text: "User roles and access", bold: true }), new TextRun(" — separate administrator and standard-user sign-ins, with admin-only capabilities.")]));
children.push(bullet([new TextRun({ text: "Shared catalog", bold: true }), new TextRun(" — a single, admin-editable list of projects, lines, stations, activities and resources that drives both the Travel Card and the Tracker.")]));
children.push(bullet([new TextRun({ text: "In-app help", bold: true }), new TextRun(" — an information (ⓘ) guide in each module.")]));
children.push(bullet([new TextRun({ text: "Production-time accounting", bold: true }), new TextRun(" — time used at a station now automatically excludes scheduled tea and lunch breaks (net vs. gross time).")]));
children.push(bullet([new TextRun({ text: "Richer overrun capture", bold: true }), new TextRun(" — multiple root causes (the 6M set plus custom causes), each with its own delay in minutes.")]));
children.push(bullet([new TextRun({ text: "New dashboards", bold: true }), new TextRun(" — a Takt Time planning panel and an Overrun Root-Cause Insights section (6M analysis, by project, designed-versus-actual by station, and a corrective-action log).")]));
children.push(bullet([new TextRun({ text: "Scheduled email reporting", bold: true }), new TextRun(" — send the dashboard report to recipients immediately or on a daily/weekly schedule, with the slides, PDFs and workbook attached.")]));
children.push(bullet([new TextRun({ text: "Admin-editable clock-out and station archiving", bold: true }), new TextRun(" — for correcting records and retiring stations without losing historical data.")]));
children.push(note("Version 1.0 of this manual is retained and has not been deleted. Where a feature is unchanged from Version 1.0, this edition repeats it so the manual is complete on its own."));

children.push(h2("How the system is structured"));
children.push(p("The application has two halves that share the same data:"));
children.push(bullet([new TextRun({ text: "The Travel Card", bold: true }), new TextRun(" — the form operators and reviewers complete each time a bus passes through a station. This is how data gets in.")]));
children.push(bullet([new TextRun({ text: "The Tracker (Line Tracker, Bus Report, Dashboard)", bold: true }), new TextRun(" — the read-only views that turn captured data into a live picture of the floor and management analytics.")]));

children.push(h2("Where the data lives"));
children.push(p("There is no traditional back-end server; all data flows through one Google Sheet (\"NI Travel Tool Data\"):"));
children.push(bullet("Submitted travel cards are sent to a Google Apps Script web app, which writes each station move to the \"Travel Card Data\" tab and related tabs (submissions, overruns, overrun causes, activities, etc.)."));
children.push(bullet("The Tracker reads the data tabs (as CSV) and refreshes automatically — production data every 60 seconds, station times every 5 minutes, the overruns data every 5 minutes, and the catalog every 2 minutes."));
children.push(bullet("The shared catalog is stored in a \"Catalog\" tab as a single JSON document, written back through the same Apps Script (protected by an admin token)."));

// ════════════════════════════════════════════════════════
// 2 USER ROLES AND ACCESS
// ════════════════════════════════════════════════════════
children.push(h1("User Roles and Access"));
children.push(p("Version 2.0 introduces two roles. Your role is decided by the credentials you sign in with and is remembered on your device."));

children.push(h2("Administrator versus standard user"));
children.push(table(
  ["Role", "Signs in as", "Intended for"],
  [
    ["Administrator", "the admin username (e.g. kmcadmin)", "Supervisors who maintain the catalog and correct records."],
    ["Standard user", "the standard username (e.g. kmc)", "Operators and reviewers logging day-to-day production."],
  ],
  [2200, 3560, 3600],
));
children.push(note("Treat credentials as confidential and obtain them from your supervisor. Because the application is a static front-end over a shared sheet, role control governs what the interface offers; it is not a substitute for sheet-level permissions."));

children.push(h2("What each role can do"));
children.push(table(
  ["Capability", "Standard user", "Administrator"],
  [
    ["Log travel cards, view all Tracker views", "Yes", "Yes"],
    ["Edit the shared catalog (projects, lines, stations, activities, resources)", "No", "Yes"],
    ["Edit the clock-out time on a travel card", "No (auto-recorded)", "Yes"],
    ["Export reports, schedule email reports, use in-app help", "Yes", "Yes"],
  ],
  [4760, 2300, 2300],
));

// ════════════════════════════════════════════════════════
// 3 GETTING STARTED
// ════════════════════════════════════════════════════════
children.push(h1("Getting Started"));

children.push(h2("Signing in"));
children.push(num("Enter your username (not case-sensitive)."));
children.push(num("Enter your password (case-sensitive). Use SHOW/HIDE to reveal it."));
children.push(num("Optionally tick \"Keep me signed in\" to skip the login screen next time on this device."));
children.push(num("Press Sign In. The system remembers whether you signed in as an administrator or a standard user."));

children.push(h2("The Home screen"));
children.push(p("After signing in you can choose Travel Card (to log a bus at a station) or Tracker (the live monitoring views)."));

children.push(h2("Light and dark mode"));
children.push(p("A sun/moon toggle on the login, Home and main screens switches the colour theme. Your choice is remembered."));

children.push(h2("In-app help (the information guide)"));
children.push(p("Each module has an information (ⓘ) button that opens a short feature guide for that module — one for the Travel Card and one for the Tracker. It lists the main features in plain language and is the quickest reminder while working."));

children.push(h2("Navigation and common controls"));
children.push(table(
  ["Control", "What it does"],
  [
    ["Home", "Return to the Home screen."],
    ["Line Tracker / Bus Report / Dashboard", "Switch between the three monitoring views."],
    ["Sync indicator", "A pulsing dot with the last-updated time, or a spinner while loading."],
    ["Estimates badge", "How many station designed-time estimates have loaded."],
    ["ⓘ Info", "Open the in-app feature guide for the current module."],
    ["Edit Catalog", "Administrators only — open the catalog editor."],
    ["Refresh", "Immediately re-fetch the latest data."],
    ["Light / Dark", "Toggle the colour theme."],
    ["Sign Out", "Log out (also clears the remembered role)."],
  ],
  [2700, 6660],
));
children.push(p("On phones and tablets the navigation collapses into a hamburger (menu) button containing the same options.", { italics: true, color: GREY }));

// ════════════════════════════════════════════════════════
// 4 FILTER BAR
// ════════════════════════════════════════════════════════
children.push(h1("The Filter Bar"));
children.push(p("A single filter bar sits at the top of all three Tracker views. Whatever you set is applied to the Line Tracker, Bus Report and Dashboard at the same time, so the whole application reflects the same slice of data."));

children.push(h2("Available filters"));
children.push(table(
  ["Filter", "Options", "Effect"],
  [
    ["Model", "All / KDC / EVS", "Limits to one bus family (by whether the model name contains KDC or EVS)."],
    ["Project", "All Projects or a specific project", "Limits to buses on one project."],
    ["Date", "All Time, Today, Yesterday, 7 Days, 30 Days, Custom", "Limits records to a date window."],
    ["Line", "All Lines or one line", "Shows only buses currently on the chosen line."],
    ["Station", "All Stations or one (enabled once a line is chosen)", "Shows only buses at the chosen station."],
    ["Status", "All, Approved, Pending, OHS Issue, Overrun, Rework", "Filters buses by their latest recorded condition."],
  ],
  [1500, 3500, 4360],
));

children.push(h2("Date ranges"));
children.push(bullet([new TextRun({ text: "Today / Yesterday", bold: true }), new TextRun(" — that single calendar day.")]));
children.push(bullet([new TextRun({ text: "7 Days", bold: true }), new TextRun(" — today plus the previous six days.")]));
children.push(bullet([new TextRun({ text: "30 Days", bold: true }), new TextRun(" — today plus the previous 29 days.")]));
children.push(bullet([new TextRun({ text: "Custom", bold: true }), new TextRun(" — choose your own From and To dates; the bar shows the inclusive number of days.")]));
children.push(p("A record is included when its timestamp falls between the start of the start date (00:00:00) and the end of the end date (23:59:59)."));

children.push(h2("Active filters and clearing"));
children.push(p("Each active filter appears as a removable chip, and a running bus count (filtered of total) is shown. Press Clear to reset everything at once."));

// ════════════════════════════════════════════════════════
// 5 LINE TRACKER
// ════════════════════════════════════════════════════════
children.push(h1("Line Tracker"));
children.push(p("The Line Tracker is the visual map of the floor. Each production line is a card containing a horizontal rail of station dots in process order, and each bus is shown as a small card above the station it currently occupies."));

children.push(h2("Reading the map"));
children.push(table(
  ["Element", "Meaning"],
  [
    ["Grey dot", "An ordinary station with no bus on it."],
    ["Green (larger) dot", "A Quality Gate / inspection station."],
    ["Red dot", "A station that currently has one or more buses."],
    ["Bus callout", "A card with the model badge, a model image and the VIN — red for KDC, blue for EVS."],
    ["\"N active\" badge", "On a line header — the number of buses on that line."],
  ],
  [2700, 6660],
));

children.push(h2("Interacting"));
children.push(bullet("Hover or tap a station dot for its code, full name and bus count."));
children.push(bullet("Hover a bus callout for its model, VIN, station and last-move time."));
children.push(bullet("Click a line header to collapse or expand it; each rail scrolls horizontally."));

children.push(h2("How a bus position is determined"));
children.push(p("A bus has one record per station it has visited. The map shows each bus once, at its latest position, by grouping records by VIN and keeping the most recent timestamp. Only buses whose station code is recognised in the catalog/station database are shown. Model and project filters hide stations and lines that do not apply."));

// ════════════════════════════════════════════════════════
// 6 BUS REPORT
// ════════════════════════════════════════════════════════
children.push(h1("Bus Report"));
children.push(p("The Bus Report is a per-bus table, sorted with the longest-resident buses first — the best view for spotting buses that are stuck or behind."));

children.push(h2("Summary cards"));
children.push(table(
  ["Card", "Meaning"],
  [
    ["Total on floor", "Number of buses shown."],
    ["On Track", "Buses within 120% of their station estimate."],
    ["Slow (>120% est.)", "Buses between 120% and 200% of estimate."],
    ["Delayed (>2x est.)", "Buses over 200% of estimate."],
    ["Avg progress", "Average completion percentage across the buses shown."],
    ["Avg time variance", "Average percentage difference of actual vs estimated time."],
    ["Pending / Rejected / OHS", "Shown only when buses are in those conditions."],
  ],
  [3000, 6360],
));

children.push(h2("Columns in each bus row"));
children.push(table(
  ["Column", "What it shows"],
  [
    ["VIN + Model", "Identifier, model badge and line."],
    ["Station", "Current station name and code."],
    ["At Station", "Time at the current station, a bar versus the estimate, and a variance pill."],
    ["Total", "Total time on the floor since the first record."],
    ["First Entry", "Date the bus first appeared."],
    ["Prog.", "Stations visited of stations on the line, as a percentage."],
    ["Badges", "Status, approval status and an OHS warning if applicable."],
  ],
  [1700, 7660],
));
children.push(note("The variance pill is colour-coded: green on or under the estimate (up to 20% over), amber up to 100% over, red beyond. Hover it for the exact estimated and actual minutes."));

// ════════════════════════════════════════════════════════
// 7 DASHBOARD
// ════════════════════════════════════════════════════════
children.push(h1("Dashboard"));
children.push(p("The Dashboard aggregates the data into management metrics and charts, honouring the filter bar."));

children.push(h2("Top metric cards"));
children.push(table(
  ["Metric", "Meaning"],
  [
    ["Total on floor", "All active buses in the current filter."],
    ["KDC units / EVS units", "Active buses of each family."],
    ["Prod. rate", "7-day rolling average of buses reaching Quality (QA) per day."],
    ["First Pass Yield", "Percentage of completed buses needing no rework (shown when rework data exists)."],
  ],
  [2700, 6660],
));

children.push(h2("Distribution charts"));
children.push(bullet([new TextRun({ text: "Buses by model", bold: true }), new TextRun(" — how many buses of each model are on the floor.")]));
children.push(bullet([new TextRun({ text: "Buses by line", bold: true }), new TextRun(" — where the buses currently are.")]));

children.push(h2("Performance highlights"));
children.push(p("Four cards name the best and slowest station and line. With estimates they rank by variance against estimate; otherwise by average dwell time. Each shows an efficiency percentage."));
children.push(note("Station and line performance focus on the plant's major (milestone) stations, so the rankings are not skewed by very short sub-stations."));

children.push(h2("Pareto and quality charts"));
children.push(bullet([new TextRun({ text: "Overrun by Station", bold: true }), new TextRun(" — top stations by total overrun minutes, with counts and averages.")]));
children.push(bullet([new TextRun({ text: "Downtime by Reason", bold: true }), new TextRun(" — Pareto of downtime minutes by reason, with cumulative percentages.")]));
children.push(bullet([new TextRun({ text: "Rework Hours by Station", bold: true }), new TextRun(" — stations ranked by total rework hours.")]));
children.push(bullet([new TextRun({ text: "Station Efficiency", bold: true }), new TextRun(" — planned divided by actual time per station, banded green (≥95%), amber (80–94%) and red (<80% bottleneck).")]));
children.push(bullet([new TextRun({ text: "Weekly Production Trend", bold: true }), new TextRun(" — buses reaching QA each week over the last 12 weeks.")]));
children.push(note("Quality, downtime and rework charts appear only once the underlying data exists; otherwise they are hidden automatically."));

children.push(h2("Takt Time planning"));
children.push(p("The Takt Time panel turns a production target into the pace the line must run at, and compares it to the actual pace. Enter two figures:"));
children.push(bullet([new TextRun({ text: "Shift hours per day", bold: true }), new TextRun(" — the productive hours available each working day.")]));
children.push(bullet([new TextRun({ text: "Production target", bold: true }), new TextRun(" — the number of buses required, per day, week, month or year.")]));
children.push(p("From these it shows four indicators:"));
children.push(table(
  ["Indicator", "Meaning"],
  [
    ["Required Takt", "The time that should be spent per bus to hit the target (the required pace)."],
    ["Actual Cycle Time", "The current time per bus, from the 7-day production rate and the shift length."],
    ["Takt Ratio", "Actual cycle time as a percentage of required takt, with an AHEAD / ON TAKT / BEHIND status."],
    ["Weekly Output Gap", "Buses per week ahead of (positive) or short of (negative) the target."],
  ],
  [2700, 6660],
));
children.push(p("A gauge marks the required-takt target so you can see at a glance whether the line is ahead of or behind takt. Your shift, target and period settings are remembered on the device. The exact formulas are in Section 11."));

children.push(h2("Overrun root-cause insights"));
children.push(p("Drawing on the dedicated overruns data, this section breaks overruns down well beyond simple station totals. It appears once the overruns data holds at least one record, and comprises four panels:"));
children.push(bullet([new TextRun({ text: "Overrun by Root Cause — 6M analysis", bold: true }), new TextRun(" — a Pareto of the six categories (Man, Machine, Method, Material, Measurement, Mother Nature) by total overrun minutes, with drill-down to the specific sub-cause under each.")]));
children.push(bullet([new TextRun({ text: "Overrun by Project", bold: true }), new TextRun(" — total and average overrun minutes for each project.")]));
children.push(bullet([new TextRun({ text: "Designed vs Actual Time by Station", bold: true }), new TextRun(" — the top overrunning stations, with twin bars comparing planned and actual minutes and a variance percentage.")]));
children.push(bullet([new TextRun({ text: "Corrective Action Log", bold: true }), new TextRun(" — the largest overruns together with the corrective actions and comments recorded on their travel cards.")]));

// ════════════════════════════════════════════════════════
// 8 TRAVEL CARD
// ════════════════════════════════════════════════════════
children.push(h1("The Travel Card (Data Entry)"));
children.push(p("The Travel Card logs a bus at a station and is the single source of all data. It is a five-step wizard — Identity, Activities, Overrun, Sign-off, Done — shown by the progress bar. The Overrun step appears only when a station takes longer than its designed time. The card serves both KDC and EVS; only the lines, stations, activities and resources valid for the chosen model are offered."));

children.push(h2("Step 1 — Identity"));
children.push(num("Bus project — select an existing project or add a new one (projects come from the shared catalog)."));
children.push(num("Bus model — choose the model (KDC or EVS; KEC is shown but inactive)."));
children.push(num("Bus VIN — select or add the VIN for the project."));
children.push(num("Production line and Station — choose where the bus is."));
children.push(num("Designed (cycle) time — loaded automatically from the Station Times sheet; can be entered manually if missing."));
children.push(num("Staff on duty — tick the operators present (remembered per station) and record the HSE resources required."));
children.push(note("When you leave the Identity step, the clock-out time is captured automatically as the current time, and is used with your clock-in to compute the time used at the station."));

children.push(h2("Step 2 — Activities"));
children.push(num("Clock in — enter the time work started at this station."));
children.push(num("Activities — set each predefined activity to Complete, Issue noted, Rework needed or N/A. \"All Complete\" and \"Clear\" shortcuts are available."));
children.push(num("Consumables & Materials Used — record quantities for preset consumables, remove any not used, and add others. Quantities are remembered per station."));
children.push(num("Health, Safety & Environment — flag any OHS issue (with a description) and note any waste generated."));

children.push(h2("Production time: shift, breaks and net time"));
children.push(p("Time used at a station is calculated from clock-in to clock-out but excludes scheduled non-productive breaks. The default schedule is a shift of 08:00–18:00 with a tea break (10:00–10:30) and lunch (13:00–14:00). The card reports both the gross elapsed time and the net productive time after removing any break overlap; the net figure is what is compared against the designed time to detect an overrun. The exact formulas are in Section 11."));

children.push(h2("Step 3 — Overrun and root-cause capture"));
children.push(p("If the net time exceeds the designed time, the form diverts to the Overrun step. It shows the designed, actual (net) and overrun minutes, and notes how many break minutes were excluded. You then identify the cause(s):"));
children.push(bullet("Select one or more of the 6M categories (Man, Machine, Method, Material, Measurement, Mother Nature), each with a specific sub-cause."));
children.push(bullet("Add custom causes beyond the 6M set where needed."));
children.push(bullet("Enter a delay in minutes against each selected cause; the form totals the delay attributed."));
children.push(bullet("Record the immediate corrective action taken and any comments."));
children.push(p("If there is no overrun this step is skipped. The causes, per-cause delays, corrective action and comments are stored on the overruns data and feed the Dashboard's Overrun Root-Cause Insights."));

children.push(h2("Step 4 — Sign-off"));
children.push(num("Reviewer name — choose a saved reviewer or type a new one (which can be saved)."));
children.push(num("Approval status — Approved, Pending review, or Rejected / Rework required."));
children.push(num("Review date and any comments, then press Submit travel card."));

children.push(h2("Step 5 — Done and PDF reports"));
children.push(p("On submission the record is saved to Google Sheets (with a local copy kept on the device). The confirmation page summarises the station (including break minutes excluded and any overrun) and offers two PDF downloads:"));
children.push(bullet([new TextRun({ text: "Station report", bold: true }), new TextRun(" — this single submission, including a per-cause overrun breakdown listing each cause and its delay plus the total delay attributed.")]));
children.push(bullet([new TextRun({ text: "Full bus report", bold: true }), new TextRun(" — the complete history logged for that VIN on this device.")]));
children.push(p("Submitting a card automatically refreshes the live dashboard. The card can also be opened pre-filled from a bus in the Tracker."));

children.push(h2("Administrator only — editable clock-out"));
children.push(p("Standard users keep the automatically recorded clock-out time. Administrators see an editable clock-out (and clock-in) field, so a mistimed record can be corrected before submission. The net production time is recalculated from the corrected values."));

// ════════════════════════════════════════════════════════
// 9 SHARED CATALOG
// ════════════════════════════════════════════════════════
children.push(h1("The Shared Catalog (Administrators)"));
children.push(p("The catalog is the single source of truth for projects, lines, stations, activities and resources. Editing it once updates both the Travel Card dropdowns and the Tracker map for everyone. Only administrators can edit it."));

children.push(h2("What the catalog controls"));
children.push(bullet("Projects — names, models and active/effective dates."));
children.push(bullet("Lines and stations shown on the Tracker map."));
children.push(bullet("The lines and stations offered on the Travel Card, and which model each applies to."));
children.push(bullet("The predefined activities and consumables/resources for each station."));

children.push(h2("Opening the catalog editor"));
children.push(p("Sign in as an administrator and press the Edit Catalog button (available from both the Travel Card and the Tracker). The editor opens as a modal with five tabs."));

children.push(h2("The editor tabs"));
children.push(h3("Projects"));
children.push(p("Add, rename or archive projects and set the model and effective dates. Projects feed the Travel Card project list and the Tracker project filter."));
children.push(h3("Lines"));
children.push(p("Define the production lines, their labels and which models they apply to."));
children.push(h3("Stations"));
children.push(p("Add or edit stations (code, name, line, order, models). Stations can be archived, tagged to specific projects, and given effective-from / effective-to dates so historical lines remain meaningful."));
children.push(h3("Activities"));
children.push(p("Maintain the list of predefined activities for each station."));
children.push(h3("Resources"));
children.push(p("Maintain the preset consumables and materials for each station, grouped by line."));

children.push(h2("Archiving and legacy data"));
children.push(p("Removing an item archives it (marks it inactive) rather than deleting it. Archived stations are still resolved when displaying older buses, so historical records are never hidden or broken. Archived stations are hidden from the live map unless a project filter that matches them is applied."));

children.push(h2("How edits reach everyone"));
children.push(p("Saving writes the whole catalog back to the Catalog tab of the Google Sheet (through the Apps Script, protected by an admin token). Other users pick up the change at the next catalog refresh (about every two minutes) or when they reload. Each surface keeps its built-in data as a seed and merges the catalog over it, so the app keeps working even if the catalog is empty or briefly unavailable."));

// ════════════════════════════════════════════════════════
// 10 EXPORTING & REPORTING
// ════════════════════════════════════════════════════════
children.push(h1("Exporting and Reporting"));

children.push(h2("Dashboard exports"));
children.push(p("A fixed export bar at the bottom of the Dashboard shares the current (filtered) view:"));
children.push(table(
  ["Export", "What you get"],
  [
    ["Excel", "A multi-sheet .xlsx workbook (Summary, Buses, Efficiency, Downtime, Rework, History)."],
    ["PDF Report", "A formatted, KMC-branded white PDF report."],
    ["Slide PDF", "A dark presentation-style PDF (cover, analytics and bus report)."],
    ["PNG", "The cover slide as a single image."],
    ["Present", "Full-screen presentation / slide-deck mode."],
    ["Email Report", "Open the Schedule Email Report dialog (see below)."],
  ],
  [2300, 7060],
));

children.push(h2("Travel card PDFs"));
children.push(p("From the Done step of a travel card you can download a single-station report (including the per-cause overrun breakdown) or a full bus report covering that VIN's logged history on the device."));

children.push(h2("Scheduled email reporting"));
children.push(p("The Email Report button opens the Schedule Email Report dialog, which sends the dashboard report — slides, PDFs and the Excel workbook — to one or more recipients, either immediately or on a recurring schedule."));

children.push(h3("Setting up a report"));
children.push(num("Recipients — one or more email addresses, separated by commas."));
children.push(num("Subject — editable; defaults to \"KMC Bus Production Dashboard Report\"."));
children.push(num("Confirm the active dashboard filters — these are shown read-only so you can see exactly what the report will cover. To change them, adjust the filters on the dashboard and reopen the dialog."));
children.push(num("Optionally set a Report Data Range (From / To) — an independent date window applied to the attached data, separate from the dashboard's own date filter."));
children.push(num("Choose a schedule: Send Now, Daily, or Weekly."));
children.push(num("For Daily or Weekly, set the send time (and, for Weekly, the day of the week)."));
children.push(num("Press the action button to send now or save the schedule."));

children.push(h3("What gets attached"));
children.push(p("The report files are generated automatically and attached to the email:"));
children.push(table(
  ["Attachment", "Contents"],
  [
    ["KMC_CoverSlide_[date].png", "Dashboard cover slide (dark theme)."],
    ["KMC_Presentation_[date].pdf", "Dark slide PDF — cover, analytics and bus report."],
    ["KMC_Dashboard_[date].pdf", "Branded white PDF report."],
    ["KMC_Dashboard_[date].xlsx", "Excel workbook (Summary, Buses, Efficiency, Downtime, Rework, History)."],
  ],
  [3400, 5960],
));

children.push(h3("Managing saved schedules"));
children.push(p("Daily and weekly schedules are listed in an Active Schedules panel showing each recipient list, the timing, any data range and the filters in force. You can cancel an individual schedule or cancel them all."));
children.push(note("Delivery depends on the email server. When an email-server endpoint is configured, reports are sent automatically (immediately, or at the saved daily/weekly time). When no server is configured, the dialog falls back to opening your mail client with a pre-filled summary, and you attach the generated files manually if your client does not include them."));

// ════════════════════════════════════════════════════════
// 11 CALCULATIONS
// ════════════════════════════════════════════════════════
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("The Calculations Behind the System"));
children.push(p("This section explains, in plain terms, every calculation the system performs. All time data ultimately comes from travel-card timestamps and from the designed (planned) cycle times held in the Station Times sheet."));

children.push(h2("Key terms"));
children.push(table(
  ["Term", "Definition"],
  [
    ["Record / move", "One travel-card row: a bus (VIN) at a station at a timestamp."],
    ["Latest position", "For each VIN, the record with the most recent timestamp."],
    ["Designed time", "The planned cycle time for a station, in minutes."],
    ["Gross time", "On a card, elapsed clock-out minus clock-in."],
    ["Net (actual) time", "Gross time minus scheduled break overlap — the figure compared to designed time."],
    ["Dwell time", "Time between a bus arriving at one station and moving to the next."],
  ],
  [2400, 6960],
));

children.push(h2("Gross, break and net production time (Travel Card)"));
children.push(p("Gross time is the raw elapsed time at the station:"));
children.push(formula("Gross (min) = ( Clock-out − Clock-in ) ÷ 60,000 ms"));
children.push(p("The system then totals any scheduled break time that overlaps the worked span (tea 10:00–10:30 and lunch 13:00–14:00), across every day the span covers, and removes it:"));
children.push(formula("Net (min) = Gross − Overlapping break minutes     (never below 0)"));
children.push(p("Net time is what the rest of the system treats as the actual time at the station."));

children.push(h2("Actual time and overrun (Travel Card)"));
children.push(p("An overrun occurs when net time exceeds the designed time:"));
children.push(formula("Overrun (min) = Net − Designed     (only when Net > Designed)"));
children.push(p("An overrun forces a root-cause analysis before the card can be signed off."));

children.push(h2("Per-cause delay attribution (Travel Card)"));
children.push(p("Each selected cause (6M or custom) can be given its own delay in minutes. The form sums them so the lost time can be apportioned:"));
children.push(formula("Total delay attributed = sum of each cause's delay minutes"));
children.push(p("These per-cause delays are stored with the submission and feed the Dashboard's Overrun Root-Cause Insights."));

children.push(h2("Time at station and total time on floor (Bus Report)"));
children.push(formula("Time at station = Now − timestamp of latest record"));
children.push(formula("Total on floor = Now − timestamp of first record"));
children.push(p("Both are shown in a friendly format (for example 2d 6h, 5h, or 40m)."));

children.push(h2("Variance against the estimate (Bus Report)"));
children.push(formula("Variance % = ( Actual minutes − Designed minutes ) ÷ Designed minutes × 100"));
children.push(p("Positive means over plan, negative means under. Calculated only for stations with a designed time."));

children.push(h2("Schedule status (Bus Report)"));
children.push(formula("Ratio = Time at station ÷ Designed time"));
children.push(table(
  ["Status", "With estimate", "Without estimate"],
  [
    ["On Track", "Ratio ≤ 1.2", "At station ≤ 24 hours"],
    ["Slow", "Ratio 1.2 to 2.0", "At station 24–48 hours"],
    ["Delayed", "Ratio > 2.0", "At station over 48 hours"],
  ],
  [1800, 4080, 3480],
));

children.push(h2("Progress along the line (Bus Report)"));
children.push(formula("Progress % = ( Distinct stations visited ÷ Stations on the line ) × 100   (capped at 100%)"));

children.push(h2("Average dwell time per station (Dashboard)"));
children.push(p("Walking each bus's sorted history, the gap between consecutive moves is measured:"));
children.push(formula("Dwell (hours) = ( time at next station − time at this station ) ÷ 3,600,000 ms"));
children.push(p("Only gaps greater than 0 and less than 72 hours are counted, to exclude errors and idle weekends. Then:"));
children.push(formula("Average dwell = Total dwell hours ÷ Number of moves counted"));

children.push(h2("Station efficiency and variance (Dashboard)"));
children.push(formula("Variance % = ( Actual hours − Estimated hours ) ÷ Estimated hours × 100"));
children.push(formula("Efficiency % = ( Estimated hours ÷ Actual hours ) × 100"));
children.push(p("100% means exactly on plan; above is faster, below is slower. Bands: green ≥95%, amber 80–94%, red <80% (bottleneck). These are computed over the plant's major stations."));

children.push(h2("Line performance (Dashboard)"));
children.push(formula("Line average dwell = mean of its stations' average dwell"));
children.push(formula("Line variance % = mean of its stations' variance %"));
children.push(formula("Line efficiency % = 100 ÷ ( 1 + Variance% ÷ 100 )"));

children.push(h2("Production rate (Dashboard)"));
children.push(formula("Prod. rate = Distinct buses reaching QA in last 7 days ÷ 7"));

children.push(h2("Takt time and output gap (Dashboard)"));
children.push(p("The Takt Time panel converts your production target into a required pace and compares it with the actual pace. First the target is expressed per week (assuming five working days):"));
children.push(formula("Target/week = Target × ( 5 if /day · 1 if /week · ÷4.33 if /month · ÷52 if /year )"));
children.push(p("Then:"));
children.push(formula("Required Takt (h/bus) = ( Shift hours/day × 5 ) ÷ Target per week"));
children.push(formula("Actual Cycle Time (h/bus) = Shift hours/day ÷ Production rate (buses/day)"));
children.push(formula("Takt Ratio = Actual Cycle Time ÷ Required Takt"));
children.push(formula("Weekly Output Gap = ( Production rate × 5 ) − Target per week"));
children.push(p("The status is Ahead of takt when the ratio is 0.95 or below, On takt between 0.96 and 1.05, and Behind takt above 1.05."));

children.push(h2("Weekly production trend (Dashboard)"));
children.push(p("Each bus's first QA arrival is grouped by ISO calendar week for the last 12 weeks. The average shown is:"));
children.push(formula("Weekly average = Total buses reaching QA ÷ Number of weeks with activity"));

children.push(h2("First Pass Yield (Dashboard)"));
children.push(formula("FPY % = ( Completed buses − Buses needing rework ) ÷ Completed buses × 100"));
children.push(p("\"Completed\" means at least one QA record; a bus counts against FPY if any of its records is flagged for rework. Bands: green ≥90%, amber 75–89%, red <75%."));

children.push(h2("Overrun analytics (Dashboard)"));
children.push(p("Overrun minutes are summed per station; each station reports total, occurrences and average:"));
children.push(formula("Average overrun = Total overrun minutes ÷ Number of overrun cards"));
children.push(p("Using the dedicated overruns data, overruns are also aggregated by 6M root cause (and sub-cause), by project, and by station with a designed-versus-actual variance:"));
children.push(formula("Station variance % = ( Total actual − Total designed ) ÷ Total designed × 100"));

children.push(h2("Downtime Pareto (Dashboard)"));
children.push(formula("Reason share % = Reason downtime ÷ Total downtime × 100"));
children.push(formula("Cumulative % = running total of reason shares (capped at 100%)"));
children.push(p("Reasons are ranked largest first — the classic Pareto ordering for finding the vital few causes."));

children.push(h2("Rework hours by station (Dashboard)"));
children.push(p("Rework hours from cards flagged for rework are summed per station and ranked highest to lowest."));

children.push(h2("The 6M root-cause framework"));
children.push(table(
  ["Category", "Covers"],
  [
    ["Man", "Operator skill, fatigue, attendance, method, communication."],
    ["Machine", "Equipment breakdown, tooling, fixtures, calibration, setup delay."],
    ["Method", "Process sequence, work instructions, procedures, design issues."],
    ["Material", "Shortages, wrong or defective parts, consumables, handling delays."],
    ["Measurement", "Gauge/instrument error, inspection delays, tolerance and documentation."],
    ["Mother Nature", "Environment — temperature, humidity, power, ventilation, vibration."],
  ],
  [2200, 7160],
));
children.push(p("Version 2.0 also allows custom causes beyond these six, each with its own attributed delay."));

// ════════════════════════════════════════════════════════
// 12 TROUBLESHOOTING
// ════════════════════════════════════════════════════════
children.push(h1("Data, Refresh and Troubleshooting"));

children.push(h2("Refresh intervals"));
children.push(table(
  ["Data", "Source", "Auto-refresh"],
  [
    ["Travel card / production data", "Travel Card Data tab (CSV)", "Every 60 seconds"],
    ["Station designed times", "Station Times sheet (CSV)", "Every 5 minutes"],
    ["Overrun root-cause data", "Overruns tab (CSV)", "Every 5 minutes"],
    ["Shared catalog", "Catalog tab (CSV)", "Every 2 minutes"],
  ],
  [3200, 4160, 2000],
));
children.push(p("Press Refresh to fetch immediately rather than waiting for the next cycle."));

children.push(h2("Common situations"));
children.push(table(
  ["You see…", "Meaning / action"],
  [
    ["\"Could not load data from Google Sheets\"", "The sheet could not be reached. Check the connection and that the sheet is still shared, then press Refresh."],
    ["A bus is missing from the map", "Its station code may not be in the catalog, or it is filtered out. Check active filters and the station code."],
    ["\"No buses on floor\"", "No records match the current filters. Widen the date range or press Clear."],
    ["Rankings show dwell instead of variance", "Station estimates have not loaded yet; they switch to variance once the Station Times sheet arrives."],
    ["Overrun root-cause insights are absent", "The overruns data has no records yet; the panels appear once at least one overrun is logged."],
    ["Email opens your mail client instead of sending", "No email server is configured, so the dialog falls back to a mail-client draft; attach the downloaded files manually."],
    ["\"Station time exceeded\" on a card", "Net time beat the designed time — complete the root-cause analysis to continue."],
    ["No Edit Catalog button", "You are signed in as a standard user. Sign in as an administrator to edit the catalog."],
  ],
  [3200, 6160],
));

children.push(new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.JUSTIFIED,
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: KMC_RED, space: 6 } },
  children: [new TextRun({ text: "End of manual (Version 2.0) — Kiira Motors Corporation, Bus Production Tracker. Version 1.0 remains available as KMC_Bus_Production_Tracker_User_Manual.docx.", italics: true, size: 18, color: GREY })] }));

// ════════════════════════════════════════════════════════
// BUILD
// ════════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: SZ_BODY, color: DARK } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: SZ_H1, bold: true, color: KMC_RED, font: FONT },
        paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0", space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: SZ_H2, bold: true, color: DARK, font: FONT },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: SZ_H3, bold: true, italics: true, color: GREY, font: FONT },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "headings", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1", alignment: AlignmentType.LEFT,
          style: { run: { font: FONT, bold: true, size: SZ_H1, color: KMC_RED },
                   paragraph: { indent: { left: GAP_1CM, hanging: GAP_1CM } } } },
        { level: 1, format: LevelFormat.DECIMAL, text: "%1.%2", alignment: AlignmentType.LEFT,
          style: { run: { font: FONT, bold: true, size: SZ_H2, color: DARK },
                   paragraph: { indent: { left: GAP_1CM, hanging: GAP_1CM } } } },
        { level: 2, format: LevelFormat.DECIMAL, text: "%1.%2.%3", alignment: AlignmentType.LEFT,
          style: { run: { font: FONT, bold: true, size: SZ_H3, color: GREY },
                   paragraph: { indent: { left: GAP_15CM, hanging: GAP_15CM } } } },
      ] },
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ] },
      { reference: "steps", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 360 } } } },
      ] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 4 } },
      children: [new TextRun({ text: "KMC Bus Production Tracker — User Manual (Version 2.0)", size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 4 } },
      children: [new TextRun({ text: "Kiira Motors Corporation  ·  Page ", size: 16, color: GREY }),
                 new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
                 new TextRun({ text: " of ", size: 16, color: GREY }),
                 new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("KMC_Bus_Production_Tracker_User_Manual_v2.__new__.docx", buffer);
  console.log("written");
});

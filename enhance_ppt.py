"""
Enhance KMC BUS PRODUCTION TRACKER.pptx with detailed, technical content.
Works in the presentation's native double-scale (20" x 11.25").
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
import copy, shutil

SRC = r"C:\Users\KMC-PC\Desktop\Office\KMC\Tracker tool\KMC BUS PRODUCTION TRACKER.pptx"
DST = r"C:\Users\KMC-PC\Desktop\Office\KMC\Tracker tool\KMC BUS PRODUCTION TRACKER v2.pptx"
shutil.copy2(SRC, DST)

prs = Presentation(DST)

# ── helpers ──────────────────────────────────────────────────────────────────
EMU = 914400  # 1 inch in EMU — but this deck uses double-scale, so 1 "unit" = 914400

def inches(n): return int(n * EMU)

RED   = RGBColor(0xCC, 0x00, 0x00)
DARK  = RGBColor(0x1E, 0x29, 0x3B)
MUTED = RGBColor(0x64, 0x74, 0x8B)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

def find_shape(slide, name):
    for s in slide.shapes:
        if s.name == name:
            return s
    return None

def set_tf(shape, runs, font_size=None, bold=None, color=None, align=PP_ALIGN.LEFT):
    """Replace text frame content with a list of (text, bold, color, size) tuples."""
    tf = shape.text_frame
    tf.clear()
    tf.word_wrap = True
    for i, run_def in enumerate(runs):
        if i == 0:
            para = tf.paragraphs[0]
        else:
            para = tf.add_paragraph()
        para.alignment = align
        text, rb, rc, rs = run_def
        run = para.add_run()
        run.text = text
        run.font.bold = rb if rb is not None else bold
        run.font.color.rgb = rc if rc is not None else (color or DARK)
        run.font.size = Pt(rs if rs else (font_size or 14))

def add_textbox(slide, left, top, width, height, runs, font_size=14, bold=False, color=None, align=PP_ALIGN.LEFT):
    txBox = slide.shapes.add_textbox(inches(left), inches(top), inches(width), inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, run_def in enumerate(runs):
        if i == 0:
            para = tf.paragraphs[0]
        else:
            para = tf.add_paragraph()
        para.alignment = align
        if isinstance(run_def, str):
            run = para.add_run()
            run.text = run_def
            run.font.size = Pt(font_size)
            run.font.bold = bold
            run.font.color.rgb = color or DARK
        else:
            text, rb, rc, rs = run_def
            run = para.add_run()
            run.text = text
            run.font.bold = rb
            run.font.color.rgb = rc or (color or DARK)
            run.font.size = Pt(rs or font_size)
    return txBox

def bullet_runs(items, size=15, label_size=16):
    """Build (text, bold, color, size) tuples for a bullet list with optional sub-text.
       items: list of str or (heading, detail) tuples
    """
    runs = []
    for i, item in enumerate(items):
        if isinstance(item, tuple):
            heading, detail = item
            runs.append((heading, True, DARK, label_size))
            runs.append(("\n" + detail, False, MUTED, size))
        else:
            runs.append((item, False, DARK, size))
        if i < len(items) - 1:
            runs.append(("\n", False, DARK, 8))  # spacer
    return runs

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 2 — COMPATIBLE WITH MULTIPLE DEVICES
# ═════════════════════════════════════════════════════════════════════════════
s2 = prs.slides[1]
# Remove placeholder footer text
for shape in list(s2.shapes):
    if shape.has_text_frame and shape.text_frame.text.strip() == "Product Launch Presentation":
        shape.text_frame.paragraphs[0].runs[0].text = ""

# Add description block below the title
add_textbox(s2, 5.87, 4.9, 7.89, 1.0,
    [("The KMC Bus Production Tracker is a web-based application — no installation required.", False, DARK, 16)],
    align=PP_ALIGN.LEFT)

add_textbox(s2, 5.87, 5.9, 7.89, 4.5,
    [
        ("Works on any modern browser", True, DARK, 16),
        ("\nAccess the full tracker on desktop, laptop, tablet, or mobile. The responsive interface automatically adapts to screen size, so floor staff can log Travel Card data on a phone while supervisors view the Dashboard on a desktop monitor.", False, MUTED, 14),
        ("\n", False, DARK, 8),
        ("No server-side dependency for viewing", True, DARK, 16),
        ("\nThe front-end is a static React + Vite application. Data is read directly from Google Sheets via the Google Visualization (gViz) API — meaning it works even without a dedicated backend server running.", False, MUTED, 14),
        ("\n", False, DARK, 8),
        ("Optional email/report server", True, DARK, 16),
        ("\nA lightweight Node.js server (server.js) enables scheduled email reports and PDF delivery — activated only when email automation is needed.", False, MUTED, 14),
    ])

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 3 — SYSTEM OVERVIEW
# ═════════════════════════════════════════════════════════════════════════════
s3 = prs.slides[2]
# Update subtitle
sub = find_shape(s3, "TextBox 20")
if sub:
    set_tf(sub, [
        ("The KMC Bus Production Tracker is built around two tightly integrated modules that share a single Google Sheets data source. "
         "Data flows from the factory floor (via the Travel Card) into a live view (via the Bus Tracker) — "
         "giving every team member, from floor worker to production manager, a consistent and up-to-date picture of bus progress.",
         False, DARK, 16)
    ])

# Add two module cards as text
add_textbox(s3, 2.0, 7.2, 7.5, 1.5,
    [("TRAVEL CARD  —  Data Capture Module", True, RED, 18)],
    align=PP_ALIGN.LEFT)
add_textbox(s3, 2.0, 8.5, 7.5, 2.5,
    [("Used by production floor staff to submit station-level data for each bus. Captures the bus model, project, activities performed, resources used, "
      "clock-in/clock-out times, and any production overruns with root-cause codes. "
      "Submissions are written to Google Sheets in real time via a Google Apps Script endpoint.", False, MUTED, 15)],
    align=PP_ALIGN.LEFT)

add_textbox(s3, 2.0, 10.7, 7.5, 1.5,
    [("BUS TRACKER  —  Monitoring & Reporting Module", True, DARK, 18)],
    align=PP_ALIGN.LEFT)
add_textbox(s3, 2.0, 11.9, 7.5, 2.3,
    [("Used by supervisors and production managers to monitor all buses in real time across every production line. "
      "Includes the Line Tracker (live floor map), Bus Report (per-bus timing analysis), "
      "and Dashboard (aggregate KPIs and charts). "
      "Reads data from the same Google Sheets source on a 2-minute auto-refresh cycle.", False, MUTED, 15)],
    align=PP_ALIGN.LEFT)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 4 — LINE TRACKER (enhance existing bullet list)
# ═════════════════════════════════════════════════════════════════════════════
s4 = prs.slides[3]
bullets = find_shape(s4, "TextBox 21")
if bullets:
    set_tf(bullets, [
        ("9 production lines tracked", True, DARK, 17),
        ("\nCovers the full manufacturing flow: Machine Shop, Frame Parts Making, Electrophoresis, Frame & Body Welding, Chassis Line 01 & 02, Paint Shop, Trim Line & Final Assembly, and Quality Inspection & Testing.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("Bus cards show model, VIN & current station", True, DARK, 17),
        ("\nEach active bus is rendered as a card displaying its model (e.g. 10.5m KDC), short VIN or bus name, and the station it is currently occupying on the line.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("Filter by model, project, station, status & date", True, DARK, 17),
        ("\nThe filter bar at the top applies globally — narrow the view by bus model (KDC / EVS), active project, specific line or station, status (Approved / Pending / OHS Issue / Overrun / Rework), or a custom date range.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("Data refreshes every 2 minutes automatically", True, DARK, 17),
        ("\nThe app polls the Google Sheets gViz endpoint on a 120-second interval. A manual Refresh button and a live 'last updated' timestamp are always visible in the header.", False, MUTED, 14),
    ])

# Update subtitle for more detail
subtitle4 = find_shape(s4, "TextBox 20")
if subtitle4:
    set_tf(subtitle4, [
        ("The Line Tracker is the real-time floor map of the production facility. "
         "Each row represents a production line; each column represents a station. "
         "Buses appear as cards positioned at their current station, "
         "so any supervisor can see at a glance where every unit is in the build process — without walking the floor.",
         False, DARK, 16)
    ])

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 5 — BUS REPORT (enhance bullets)
# ═════════════════════════════════════════════════════════════════════════════
s5 = prs.slides[4]
bullets5 = find_shape(s5, "TextBox 21")
if bullets5:
    set_tf(bullets5, [
        ("Per-bus station-by-station time breakdown", True, DARK, 17),
        ("\nFor each bus, the report lists every station visited, the time spent at that station (actual vs. estimated), and cumulative total production time.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("ON TRACK / SLOW / DELAYED status flags", True, DARK, 17),
        ("\nStatus is computed automatically: ON TRACK (≤100% of estimate), SLOW (100–120%), DELAYED (>120% or 2+ days at station). Delayed buses are highlighted in red for immediate attention.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("Time variance vs. estimate", True, DARK, 17),
        ("\nEach station row shows the variance between actual time spent and the station-time estimate — displayed as a delta value (+/−) and a percentage. The average variance across all stations is shown in the summary row.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("Progress % and first-entry date", True, DARK, 17),
        ("\nProgress is calculated as stations completed ÷ total stations on the line. First-entry date anchors the timeline for each bus — useful for tracking project delivery commitments.", False, MUTED, 14),
    ])

subtitle5 = find_shape(s5, "TextBox 20")
if subtitle5:
    set_tf(subtitle5, [
        ("The Bus Report provides a granular breakdown of each individual bus — showing exactly how long it spent at every station, whether it is on schedule, and where time is being lost. "
         "It is the primary tool for bottleneck detection and production planning.",
         False, DARK, 16)
    ])

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 6 — DASHBOARD (add bullet content — currently empty)
# ═════════════════════════════════════════════════════════════════════════════
s6 = prs.slides[5]
subtitle6 = find_shape(s6, "TextBox 20")
if subtitle6:
    set_tf(subtitle6, [
        ("The Dashboard aggregates data across all filtered buses and presents it as high-level KPIs and charts. "
         "It is designed for production managers who need a quick, numbers-first view of the floor's overall performance.",
         False, DARK, 16)
    ])

# Add bullet content (Dashboard had no TextBox 21)
add_textbox(s6, 2.0, 6.9, 7.75, 7.0, [
    ("TOTAL ON FLOOR", True, DARK, 17),
    ("\nCount of all active buses currently on the production floor, regardless of line or status.", False, MUTED, 14),
    ("\n", False, DARK, 6),
    ("KDC UNITS / EVS UNITS", True, DARK, 17),
    ("\nBreakdown of active buses by model family — Kiira DC (KDC) and Electric Vehicle Series (EVS). Useful for tracking model-specific production load.", False, MUTED, 14),
    ("\n", False, DARK, 6),
    ("Production Rate (buses/day)", True, DARK, 17),
    ("\n7-day rolling average of completed buses per day. Calculated from station completion timestamps in the Sheets data. Compares against your Takt Time target.", False, MUTED, 14),
    ("\n", False, DARK, 6),
    ("Takt Time Analysis", True, DARK, 17),
    ("\nEnter working hours/day and target buses/week to compute the Required Takt Time. The dashboard then shows Actual Cycle Time from real data, flagging any gap between them.", False, MUTED, 14),
    ("\n", False, DARK, 6),
    ("Buses by Model & Line charts", True, DARK, 17),
    ("\nHorizontal bar charts show how buses are distributed across models and production lines — instantly revealing where concentration is highest.", False, MUTED, 14),
])

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 7 — TRAVEL CARD (add all content — currently only has title)
# ═════════════════════════════════════════════════════════════════════════════
s7 = prs.slides[6]

# Update the title shape to make it a subtitle/intro
title7 = find_shape(s7, "TextBox 23")
if title7:
    set_tf(title7, [
        ("Travel Card", True, DARK, 32),
        ("\n\nA structured, multi-step digital form that replaces paper-based production station records. "
         "Each submission captures the full context of a bus's time at a station — "
         "who worked on it, what was done, how long it took, and whether any overruns occurred.",
         False, MUTED, 16)
    ])

# 5-step workflow
add_textbox(s7, 1.5, 6.8, 5.2, 1.2,
    [("5-STEP SUBMISSION WORKFLOW", True, DARK, 16)],
    align=PP_ALIGN.LEFT)

steps = [
    ("Step 1 — Identity",    "Select the project (e.g. 100 Bus Project), bus model (KDC / EVS), and enter or select the bus VIN or name."),
    ("Step 2 — Activities",  "Log each task performed at the station. For each activity, select the type, assign resources (workers/equipment), and record clock-in and clock-out times. Production time is automatically calculated, excluding break periods."),
    ("Step 3 — Overrun",     "If the station time exceeds the standard estimate, capture the overrun duration and select a root cause (e.g. material delay, rework, OHS issue). Custom cause codes can also be entered."),
    ("Step 4 — Sign-Off",    "The station supervisor reviews the entry and confirms completion. Admin users can adjust the clock-out time if needed (e.g. late data entry corrections)."),
    ("Step 5 — Submit",      "The completed record is sent via HTTPS POST to a Google Apps Script endpoint, which writes it to the designated Google Sheets tab. A confirmation is shown on success."),
]
for i, (heading, detail) in enumerate(steps):
    add_textbox(s7, 1.5, 7.8 + i * 1.85, 5.2, 0.6,
        [(heading, True, RED if i % 2 == 0 else DARK, 15)], align=PP_ALIGN.LEFT)
    add_textbox(s7, 1.5, 8.3 + i * 1.85, 5.2, 1.25,
        [(detail, False, MUTED, 13)], align=PP_ALIGN.LEFT)

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 8 — EXPORT & SHARING (fix footers, add more detail to descriptions)
# ═════════════════════════════════════════════════════════════════════════════
s8 = prs.slides[7]
# Fix placeholder footers
for shape in s8.shapes:
    if shape.has_text_frame:
        t = shape.text_frame.text.strip()
        if t in ("Presentation Template", "Product Launch Presentation"):
            shape.text_frame.paragraphs[0].runs[0].text = ""

# Enhance each export description
descriptions = {
    "TextBox 25": "Delivers a formatted production status report by email. Recipients and schedule are configured in the optional Node.js server. Useful for daily/weekly management updates without manual effort.",
    "TextBox 30": "Generates a multi-page PDF report of the current filtered bus data, including station-level timing, status flags, and summaries — formatted for printing or formal distribution.",
    "TextBox 35": "Exports production data to an .xlsx workbook with structured sheets for raw records, station summaries, and overrun logs — ready for further analysis in Excel or Google Sheets.",
    "TextBox 40": "Creates a slide-optimised PDF with one bus per page, showing its station history as a concise visual summary. Ideal for team briefings or management reviews.",
    "TextBox 45": "Takes a PNG snapshot of the current Dashboard or Line Tracker view. Useful for quickly attaching a visual to a message or report without opening the full application.",
    "TextBox 50": "Renders the completed Travel Card as a formatted PDF document — preserving the station data, activities, times, and sign-off details in a printable record.",
}
for name, new_text in descriptions.items():
    shape = find_shape(s8, name)
    if shape and shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            for run in para.runs:
                run.text = ""
        para = shape.text_frame.paragraphs[0]
        run = para.add_run()
        run.text = new_text
        run.font.size = Pt(13)
        run.font.color.rgb = MUTED

# ═════════════════════════════════════════════════════════════════════════════
# SLIDE 9 — KEY BENEFITS (expand each benefit with a description)
# ═════════════════════════════════════════════════════════════════════════════
s9 = prs.slides[8]
# Fix placeholder footers
for shape in s9.shapes:
    if shape.has_text_frame:
        t = shape.text_frame.text.strip()
        if t in ("Presentation Template", "Product Launch Presentation"):
            shape.text_frame.paragraphs[0].runs[0].text = ""

benefits_box = find_shape(s9, "TextBox 22")
if benefits_box:
    set_tf(benefits_box, [
        ("1.  Real-Time Production Visibility", True, DARK, 17),
        ("\nEvery bus is tracked across all 9 production lines with live position data. Supervisors can see exactly where each unit is without leaving their desk — eliminating the need for manual floor walks or status calls.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("2.  Early Bottleneck Detection", True, DARK, 17),
        ("\nThe Bus Report automatically flags SLOW and DELAYED buses based on time-variance thresholds. Managers can identify which stations are consistently overrunning before delays compound across the line.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("3.  Accurate Production Records", True, DARK, 17),
        ("\nThe Travel Card replaces informal or paper-based logs with a structured digital form. Every station entry is timestamped, activity-coded, and stored in Google Sheets — creating an auditable production history.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("4.  Data-Driven Planning", True, DARK, 17),
        ("\nThe Dashboard's Takt Time module lets managers set a production target and immediately compare it against actual cycle time from real floor data — enabling evidence-based capacity planning.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("5.  Overrun Accountability", True, DARK, 17),
        ("\nEvery overrun is captured at the point of occurrence with a root-cause code. This creates a searchable, quantifiable record of delay drivers — turning recurring problems into visible, manageable data.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("6.  Reduced Reporting Overhead", True, DARK, 17),
        ("\nWith one-click exports to Excel, PDF, Slide PDF, and automated email reports, manual report compilation is eliminated. Stakeholders receive formatted data on demand or on a schedule.", False, MUTED, 14),
        ("\n", False, DARK, 6),
        ("7.  Centralized Catalog Management", True, DARK, 17),
        ("\nAdmin users maintain a single shared catalog of projects, lines, stations, activities, and resources. All users — Travel Card and Bus Tracker — read from this same source, ensuring consistent data across the organisation.", False, MUTED, 14),
    ])

# ── save ──────────────────────────────────────────────────────────────────────
prs.save(DST)
print(f"Saved: {DST}")

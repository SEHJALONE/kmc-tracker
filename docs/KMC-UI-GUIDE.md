# KMC UI Design Guide

**Version 1.0 · 16 October 2026 · Kiira Motors Corporation, Production (DPN)**

This guide describes the look and behaviour of the KMC Bus Production Tracker so
that other KMC systems (and the people or AI tools that build them) can match it.
Follow it and a user moving between KMC systems should feel they are in one
product. The reference implementation is in this repository:

| What | Where |
|---|---|
| Design tokens and shared classes | `src/styles/design.css` (+ base tokens in `src/index.css`) |
| Chart and tile components | `src/components/ui/Charts.jsx` |
| Page frame and light/dark switch | `src/components/ui/PageShell.jsx`, `src/components/ui/ThemeSwitch.jsx` |
| Worked examples | `src/components/TravelCardHub.jsx`, `src/components/TaskRunner.jsx`, `src/components/Dashboard.jsx` |
| Visual benchmark | `Graphics/` (gradient infographic elements, numbered ribbons, target rings) |

---

## 1. Principles

1. **Readable first.** Decoration never sits between the user and the text. Every
   photo gets an overlay, every coloured fill carries white text with a shadow,
   and secondary text is never fainter than the "muted" colour below.
2. **One palette, two grounds.** Gradients and status colours are identical in
   light and dark mode. Only the page, panel and socket colours change.
3. **Depth, not borders.** Things that hold a value (bars, rings, inputs, chips)
   sit in a recessed **socket**. Things you read or press (panels, buttons, orbs)
   are raised with a soft shadow.
4. **Numbers are the headline.** Counts and times use the display face (Bebas
   Neue), large. Labels above them are small, uppercase and spaced.
5. **The main action is obvious.** Each screen has one primary action, shown as a
   red gradient button or a large circular "orb". Everything else is quieter.
6. **Works on a phone.** Every layout collapses to one column at 520–760 px with no
   sideways scrolling, and touch targets are at least 44 px.

---

## 2. Colour

### 2.1 Grounds and surfaces (change with the theme)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg-base` | `#151820` | `#eef2f6` | Fallback page colour |
| `--page-image` | `Bus background.png` | `Bus background 2.png` | Page photo |
| `--page-overlay` | slate gradient, 90–95% | pale gradient, 90–95% | Always over the photo |
| `--panel-bg` / `--bg-surface` | `rgba(34,39,50,.80–.84)` | `rgba(255,255,255,.88–.90)` | Panels, cards (with 12 px blur) |
| `--panel-solid` | `#232833` | `#ffffff` | Opaque panel (switch thumb, clock face) |
| `--socket-bg` | `#191d25` | `#e3e8ef` | Recessed tracks |
| `--socket-shadow` | inset dark | inset grey + white lip | Recess effect |
| `--panel-shadow` | `0 18px 40px rgba(0,0,0,.45)` | `0 14px 34px rgba(15,23,42,.10)` | Raised effect |

The page background always has two faint radial glows (teal top-right, red
bottom-left) under the overlay. They are what makes the ground feel like the
benchmark rather than flat grey.

### 2.2 Text (change with the theme)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--text-heading` | `#f8fafc` | `#0f172a` | Titles, big numbers |
| `--text-primary` | `#e2e8f0` | `#1e293b` | Body text |
| `--text-secondary` | `#94a3b8` | `#475569` | Supporting text |
| `--text-muted` | `#8a97ab` | `#5b6b80` | Labels, captions — the faintest text allowed for words |
| `--text-dim` | `#64748b` | `#7a889b` | Tick marks, dividers, disabled — not for sentences |

On a photo or a coloured fill, text is white (`#fff`) with
`text-shadow: 0 2px 6px rgba(0,0,0,.35)`, and secondary text is white at 72–84%
opacity. Never below 70%.

### 2.3 Gradients and series colours (same in both themes)

Every gradient runs light → saturated at 135° (90° for horizontal bars, bottom →
top for columns).

| Name | From | To | Solid | Meaning when used for status |
|---|---|---|---|---|
| red | `#ff8a7a` | `#dc2626` | `#ef4444` | Brand, primary action, over time, rejected |
| amber | `#ffd42a` | `#ff8400` | `#ff9a0a` | Waiting, warning, near the limit |
| lime | `#d6f53b` | `#20c464` | `#2fc96a` | Done, approved, on time |
| teal | `#a9dccf` | `#1c78a6` | `#2492b3` | Information, neutral measures |
| pink | `#ffb4c9` | `#e14fd6` | `#e14fd6` | Secondary series (e.g. activities) |
| blue | `#8fd3ff` | `#2563eb` | `#3b82f6` | Counts, totals |

For a chart with several unrelated series use the order **pink, lime, amber, teal,
blue, red**. Keep status meanings fixed: green is always good, amber always
"needs attention", red always "late / failed / primary".

Existing model colours stay: KDC red, EVS sky blue.

---

## 3. Type

| Role | Font | Size | Style |
|---|---|---|---|
| Display: page titles, big numbers, timers, orb text | **Bebas Neue** | 24–44 px (numbers up to 44) | letter-spacing .04–.06em, line-height ~1 |
| Labels, buttons, chips | **Montserrat** 600–800 | 10–12 px | UPPERCASE, letter-spacing .08–.14em |
| Body, tables, forms | **Inter** 400–700 | 12–14 px | normal case |
| Codes (VIN, station code) | monospace | 12–14 px | bold for station codes |

Load from Google Fonts:
`Inter:400..800`, `Bebas Neue`, `Montserrat:500..800`.

Rules: Bebas Neue is only for short text (it is all-caps and narrow). Never set a
paragraph in it. Labels sit **above** their value. Don't use more than three sizes
on one card.

---

## 4. Shape and spacing

- Radii: panels **16–18 px**, banners **20 px**, inputs **10 px**, buttons and chips
  **fully round (999 px)**, orbs **circles**.
- Spacing scale: 4, 6, 8, 10, 12, 14, 16, 18, 22, 24 px. Gaps between tiles 12 px,
  between sections 20–24 px, panel padding 14–20 px.
- Content column: max **1120–1280 px**, centred; admin lists max **1000 px**.
- Page gutters: `clamp(14px, 4vw, 32px)`.

---

## 5. Components

Class names refer to `src/styles/design.css`; React components to
`src/components/ui/`.

### 5.1 Page frame — `.kmc-page`, `PageShell`
Themed photo + overlay background on every page. Sticky translucent header
(`.kmc-head`) with: Back button, KMC logo (light/dark version), Bebas title and a
small uppercase subtitle, optional actions, and the **theme switch at the far
right**.

### 5.2 Light / dark switch — `.kmc-theme-switch`, `ThemeSwitch`
Two segments (sun, moon) in a socket; the active one is a raised thumb. Always
visible on every page, always top-right. The choice is remembered on the device
(`localStorage`), and defaults to the device's own preference.

### 5.3 Panel — `.kmc-panel`
Translucent surface, 1 px subtle border, 16 px radius, raised shadow, 12 px
backdrop blur. Everything readable lives in a panel; nothing sits directly on
the photo except the page title.

### 5.4 Banner (module header)
150 px tall, 20 px radius, a module photo under a left-to-right scrim
`rgba(10,13,20,.92) → .72 → .50`. White Bebas title (34 px), white subtitle at
78%, Back button as a translucent pill, status badge and theme switch on the
right.

### 5.5 Stat tile — `.kmc-stat`, `StatTile`
Panel with a 5 px gradient strip on the left edge, uppercase label, a Bebas number
(40–44 px), and one short line of context ("3 this week", "edit from My
Submissions"). Grid of 4 on desktop, 2 on phone. Colour the number only when it
needs action (red for rework/overdue).

### 5.6 Buttons — `.kmc-btn`
- `primary`: red gradient, white text, red glow. One per screen.
- default: translucent panel, medium border.
- `ok`: lime gradient (confirm complete).
- `ghost`: transparent (Cancel, Discard).
All are fully round pills, Montserrat uppercase 11 px.

### 5.7 Orb — `.kmc-orb`
The big circular action (Start / End, Legacy, START). A recessed ring around a
glossy gradient face with an icon and a Bebas label. 170–200 px. Hover lifts it;
when something is running it "breathes" (`.live`). A small amber count badge sits
top-right when there are open items. Use at most two per screen.

### 5.8 Socket bar — `.kmc-track` + `.kmc-fill`, `SocketBar`
Horizontal progress: a fully rounded recessed track, 2 px inner padding, holding a
gradient pill with a gloss highlight. Height 10–14 px. Pair it with a value chip.
A target line (e.g. 100 %) is a 2 px bar in `--text-secondary`.

### 5.9 Value chip — `.kmc-chip`
Pill in a socket: a text part and a coloured end with a Bebas value —
"9 buses | 100%", "1 | Start". Use for legends, step numbers and small KPIs.

### 5.10 Column chart — `ColumnChart`
Vertical gradient pills, each inside a full-height socket, with the value in Bebas
above and the label below. Dashed grid at 50 % and 100 %. Today/selected column in
red. When everything is zero, show a sentence ("No cards filed this week yet")
instead of empty bars.

### 5.11 Target rings — `RingGauge`
Concentric rings (outer = most important). Each is a socket track with a gradient
arc and round caps, starting at 12 o'clock. Bebas total in the centre, uppercase
caption under it, legend below with the numbers.

### 5.12 Numbered ribbon — `.kmc-ribbon`, `Ribbon`
A list row with a coloured numeral block (01, 02 …) on the left, content in the
middle and actions on the right. Amber for open items, red when overdue, teal for
history. On phones the actions drop under the content.

### 5.13 Trend line
Glowing gradient line (teal → lime) on top of a wide socket-coloured shadow line,
soft gradient area under it, hollow point markers, Bebas values above the points.

### 5.14 Live timer (Start/End clock)
Outer ring = working time vs designed time (lime → amber at 85 % → red when over)
with a glowing head; inner pink ring = activities ticked; one ripple per second;
a comet orbiting once a minute; Bebas `HH:MM` with smaller coloured seconds; the
colon blinks. All motion stops for users who ask for reduced motion.

### 5.15 Forms
Inputs 10 px radius, 14 px text, label above in Montserrat uppercase 10 px.
Inputs use `--input-bg` / `--input-border`; focus shows the red focus border.
Native selects and date pickers follow the theme (`color-scheme`).

---

## 6. Motion

- Bars and rings grow into place (0.6–0.8 s ease).
- Hover lifts by 1–3 px; press scales to 0.98.
- Only live things animate continuously (running timers, open-task orbs).
- Respect `prefers-reduced-motion: reduce`: no breathing, ripples, orbits or
  pulsing.

---

## 7. Accessibility checklist

- [ ] Body text contrast ≥ 4.5:1 on its panel in both themes; labels ≥ 3:1.
- [ ] No text placed directly on a photo without the overlay or scrim.
- [ ] Status is never shown by colour alone — add a word or number ("Rework", "+12 MIN OVER").
- [ ] Charts have an `aria-label` that reads the values.
- [ ] Buttons and orbs have visible focus (`:focus-visible` outline) and a text label or `aria-label`.
- [ ] Touch targets ≥ 44 px on phones; no sideways scrolling at 375 px.
- [ ] Theme switch present and working on every page.

---

## 8. Do and don't

| Do | Don't |
|---|---|
| One red primary action per screen | Several competing red buttons |
| Big Bebas number + small label above it | Long sentences in Bebas Neue |
| Put readable content in panels over the photo | Text straight on the photo |
| Use the fixed status colours (green good, amber attention, red late) | Re-use red for "good" or green for "warning" |
| Show an empty-state sentence | Empty axes and zero-height bars |
| Same tokens for every module | Hard-coded hex colours per page |
| Test both themes and a phone width | Ship dark-only colours (e.g. white text on a light card) |

---

## 9. Starting a new KMC system

1. Copy `src/styles/design.css` and the font link into the new project.
2. Set `data-theme="dark|light"` on `<html>` and add the theme switch to the header.
3. Wrap each page in the page frame (`.kmc-page` + `.kmc-head`), put content in `.kmc-panel`s.
4. Build numbers with stat tiles, progress with socket bars, comparisons with columns,
   proportions with target rings, lists with numbered ribbons.
5. Run the accessibility checklist in both themes and at 375 px wide.

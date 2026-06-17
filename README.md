# KMC Bus Production Tracker

A React dashboard for monitoring bus production lines in real time. Data is pulled from a Google Sheet and refreshed automatically every minute.

## Features

- **Line Tracker** — visual map of each bus's current station position
- **Bus Report** — per-bus history with cycle times, approval status, and OHS flags
- **Dashboard** — aggregated production metrics
- **Travel Card** — form to log or look up a bus at a station

Buses can be filtered by model family (KDC / EVS) and by date range across all views.

## Tech Stack

- [React](https://react.dev) + [Vite](https://vitejs.dev)
- Data source: Google Sheets (published CSV, no backend required)

## Getting Started

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

## Data Source

Production data is read from a publicly published Google Sheet CSV. The sheet is expected to have columns for VIN, bus model, station code, and timestamp. Optional columns (designed cycle time, approval status, OHS issue, overrun minutes) are supported when present.

## Notes

- Login is handled client-side via `localStorage`. No server or auth service is required.
- The project is under active development — features and structure will change.

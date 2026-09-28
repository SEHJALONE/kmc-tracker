# Sheet backups

`Backup.gs` backs up every Google Sheet the tracker depends on into a private
**KMC Tracker Backups** folder in My Drive, one dated sub-folder per night.

## Install (once)
1. script.google.com → **New project** → name it "KMC Tracker Backups". Keep it
   separate from the live Travel Card script.
2. Paste `Backup.gs` over the default code and save.
3. Pick `installDailyTrigger` in the function dropdown → **Run** → approve the
   permissions. This installs the 2am nightly run and takes a first backup now.

After the scoreboard sheet is rebuilt, update its `id` in `SOURCES` and run
`resetChangeTracking` so the next run captures everything.

## What a night produces
| Sheet changed since last backup? | Result |
|---|---|
| No | Nothing (costs no storage) |
| Yes | Its `.xlsx` inside that night's `KMC Tracker YYYY-MM-DD.zip` |
| Yes, and it's Sunday | Also a native Google Sheets copy |
| Password sheet changed | Native copy only; it is never put in the zip, because it holds plaintext passwords |

Retention: every night for 14 days, Sundays for 8 weeks, and the 1st of each
month for 12 months. Older folders go to the Drive trash (recoverable for 30
days). If a source sheet goes missing, you get an email the next morning.

## Restore
- **From a native copy:** open it, **File → Make a copy**, then re-share and
  update the sheet ID in the app if the ID changed.
- **From the zip:** download it, unzip, upload the `.xlsx` to Drive, then
  **Open with → Google Sheets → File → Save as Google Sheets**.

Never share the backups folder. It holds copies of the password sheet.

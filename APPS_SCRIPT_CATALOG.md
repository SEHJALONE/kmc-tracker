# Shared Catalog — Google Sheets + Apps Script setup

The admin "Edit Catalog" feature stores one JSON document in a **`Catalog`** tab of
the same Google Sheet the app already reads, and writes to it through your
existing Apps Script web app. This is the only part that must be set up on the
Google side — the app itself needs no changes.

There are three one-time steps.

---

## 1. Create the `Catalog` tab

1. Open the tracker spreadsheet
   (`…/d/1npt7Tf2yFVZxb93wsFxj3SGLuTLFMVc2GQBTdaMw_es/edit`).
2. Add a new tab named exactly **`Catalog`** (case-sensitive).
3. In the first row, put headers in **A1** and **B1**:

   | key | value |
   |-----|-------|

4. Leave the rest empty. The app will create/update the `catalog` row on the
   first admin save. (The sheet is already shared "anyone with the link can
   view", which is what the app's read path needs — no extra sharing required.)

---

## 2. Pick an admin token

Open `src/data/catalogConfig.js` and change:

```js
export const CATALOG_ADMIN_TOKEN = 'CHANGE-ME-kmc-admin-token';
```

to a secret value of your choosing (any hard-to-guess string). Use the **same**
value in the Apps Script below. This token is what actually stops a non-admin
from writing catalog changes — only the admin build/session sends it, and the
script rejects writes without it.

---

## 3. Add the catalog branch to your Apps Script

Open the Apps Script project bound to the sheet
(**Extensions → Apps Script** from the spreadsheet, or the project behind the
`/macros/s/AKfycbwd…/exec` URL the app posts to).

Your current `doPost(e)` already handles travel-card submissions. Add the
catalog branch at the **top** of `doPost`, before your existing logic, and paste
the helper function. Replace the token to match step 2.

```js
// === SHARED ADMIN TOKEN — must equal CATALOG_ADMIN_TOKEN in catalogConfig.js ===
var CATALOG_ADMIN_TOKEN = 'CHANGE-ME-kmc-admin-token';

function doPost(e) {
  // ---- Catalog save branch (added) -------------------------------------------
  if (e && e.parameter && e.parameter.action === 'saveCatalog') {
    if (e.parameter.token !== CATALOG_ADMIN_TOKEN) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return saveCatalog_(e.parameter.payload);
  }
  // ---------------------------------------------------------------------------

  // ↓↓↓ YOUR EXISTING TRAVEL-CARD SUBMISSION CODE STAYS HERE, UNCHANGED ↓↓↓
  // (the part that reads e.parameter.payload and appends a row to
  //  "Travel Card Data"). Do not delete it.
}

// Writes the catalog JSON into the Catalog tab as a single key/value row.
function saveCatalog_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Catalog');
  if (!sheet) {
    sheet = ss.insertSheet('Catalog');
    sheet.getRange('A1:B1').setValues([['key', 'value']]);
  }
  // Validate it is parseable JSON before storing.
  try { JSON.parse(payload); } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'bad-json' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Find an existing 'catalog' row, else append.
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === 'catalog') { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) {
    sheet.appendRow(['catalog', payload]);
  } else {
    sheet.getRange(rowIndex, 1, 1, 2).setValues([['catalog', payload]]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Redeploy (keep the same URL)

After saving the script:

1. **Deploy → Manage deployments**.
2. Click the pencil (Edit) on your existing Web App deployment.
3. Set **Version → New version**, then **Deploy**.

Editing the existing deployment keeps the same `/exec` URL, so no app config has
to change. (Creating a brand-new deployment would mint a new URL and break
posting.)

---

## Notes

- **Reads** use the public gviz CSV of the `Catalog` tab — no token, no auth.
  The browser fetches the JSON and merges it over the app's built-in seed data,
  so the app works fully even before the first save.
- **Writes** are `no-cors` POSTs, so the browser can't read the response; the app
  optimistically applies the change locally and re-fetches shortly after to
  reconcile with the server copy.
- The admin token only travels from admin sessions. Keep the deployed build's
  `catalogConfig.js` token private (anyone with the static JS bundle can read it,
  so this is "good enough" gating, not bank-grade security — see the caveat we
  discussed).

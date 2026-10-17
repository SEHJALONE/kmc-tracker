// Email goes out through the tracker's Apps Script web app (the same one that
// signs people in), which sends from the Gmail account it runs as — so the site
// and Vercel hold no email password or API key. The script checks the signed
// session itself. Script side: tools/mail-relay/Mail.gs.
import { CATALOG_WRITE_URL } from './catalogConfig.js';
import { sessionParam } from './session.js';

// The script deployed before the October 2026 update files ANY request it does
// not recognise that carries a `payload` as a Travel Card — so an email or task
// request sent to it becomes a junk row in the live submissions tab. Before the
// first such request, ask once (with no payload, so nothing can be written)
// whether the deployed script knows the new actions. The current script answers
// "unauthorized" or "ok"; the old one fails to parse the missing payload.
let probe = null;
export function scriptIsCurrent() {
  if (!probe) {
    probe = fetch(CATALOG_WRITE_URL, { method: 'POST', body: new URLSearchParams({ action: 'listTravelTasks' }) })
      .then(r => r.json())
      .then(j => !!j && (j.status === 'ok' || j.message === 'unauthorized'))
      .catch(() => { probe = null; return false; });   // offline: ask again next time
  }
  return probe;
}

export const OUTDATED_SCRIPT = 'The tracker\'s Apps Script has not been updated yet, so this was not sent. Ask the system administrator to deploy the new script.';

// action: 'sendReportEmail' | 'notifyCardSubmitted' (signed-in).
// Resolves with the script's reply ({ status:'ok', accepted, rejected, ... });
// rejects with a message fit to show the person who pressed Send.
export async function sendViaAppsScript(action, payload) {
  if (!(await scriptIsCurrent())) throw new Error(OUTDATED_SCRIPT);
  const body = new URLSearchParams({ action, ...sessionParam(), payload: JSON.stringify(payload) });
  let json;
  try {
    const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
    json = await res.json();
  } catch {
    throw new Error('Could not reach the email service. Check your connection and try again.');
  }
  if (json?.status !== 'ok') {
    throw new Error(
      json?.message === 'unauthorized'
        ? 'Your session has expired. Sign in again, then resend.'
        : json?.message || 'The email could not be sent.'
    );
  }
  return json;
}

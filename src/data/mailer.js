// Email goes out through the tracker's Apps Script web app (the same one that
// signs people in), which sends from the Gmail account it runs as — so the site
// and Vercel hold no email password or API key. The script checks the signed
// session itself. Script side: tools/mail-relay/Mail.gs.
import { CATALOG_WRITE_URL } from './catalogConfig.js';
import { sessionParam } from './session.js';

// action: 'sendReportEmail' | 'notifyApproved' (signed-in) | 'notifyAdminNew' (public).
// Resolves with the script's reply ({ status:'ok', accepted, rejected, ... });
// rejects with a message fit to show the person who pressed Send.
export async function sendViaAppsScript(action, payload) {
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

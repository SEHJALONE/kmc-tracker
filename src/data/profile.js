// The signed-in person's own account details (Settings page): read and saved
// through the Apps Script's getMyProfile / updateMyProfile actions, which only
// ever touch the caller's own row. A copy is kept on the device so the name and
// photo show at once on the next visit.
import { CATALOG_WRITE_URL } from './catalogConfig';
import { sessionParam } from './session';

const KEYS = { fullName: 'kmc_user_fullname', email: 'kmc_user_email', phone: 'kmc_user_phone', photo: 'kmc_user_photo' };
export const PHOTO_MAX_CHARS = 40000;   // keep in step with PROFILE_PHOTO_MAX_CHARS in Code-with-email.gs
export const PASSWORD_MIN = 8;

export function cachedProfile() {
  const out = {};
  for (const [field, key] of Object.entries(KEYS)) {
    try { out[field] = localStorage.getItem(key) || ''; } catch { out[field] = ''; }
  }
  return out;
}

export function cacheProfile(user) {
  for (const [field, key] of Object.entries(KEYS)) {
    try {
      if (user && user[field]) localStorage.setItem(key, String(user[field]));
      else localStorage.removeItem(key);
    } catch { /* storage full or blocked: the page still works from the server copy */ }
  }
}

export function clearProfileCache() { cacheProfile(null); }

async function call(action, extra = {}) {
  try {
    const body = new URLSearchParams({ action, ...sessionParam(), ...extra });
    const res = await fetch(CATALOG_WRITE_URL, { method: 'POST', body });
    const json = await res.json();
    if (json.status === 'ok') return { ok: true, ...json };
    return { ok: false, error: json.message || 'unknown-error', suggestion: json.suggestion || '' };
  } catch (e) {
    return { ok: false, error: 'network', detail: e.message };
  }
}

export const fetchMyProfile = () => call('getMyProfile');
export const saveMyProfile = (patch) => call('updateMyProfile', { payload: JSON.stringify(patch) });

// Requests for more access (see components/MoreAccess.jsx). Administrators get
// everyone's list from the same action; everyone else gets their own.
export const requestMoreAccess = (payload) => call('requestMoreAccess', { payload: JSON.stringify(payload) });
export const listAccessChangeRequests = () => call('listAccessChangeRequests');
export const resolveAccessChangeRequest = (id, status, note = '') => call('resolveAccessChangeRequest', { id, status, note });

// A server that predates the Settings page does not know these actions. It
// answers "unknown-action", or (the script live in Nov 2026) falls through to
// its Travel Card parser and reports a JSON error.
export const isOldServer = (error) =>
  ['unknown-action', 'empty-submission'].includes(error) || /not valid JSON|Unexpected (token|end)/i.test(String(error || ''));

export function profileErrorText(r) {
  switch (r.error) {
    case 'unauthorized':      return 'Your sign-in has expired. Sign out, sign in again, then retry.';
    case 'wrong-password':    return 'The current password is not correct.';
    case 'too-many-attempts': return 'Too many wrong passwords. Wait 10 minutes, then try again.';
    case 'weak-password':     return `The new password needs at least ${PASSWORD_MIN} characters.`;
    case 'bad-email':         return r.suggestion ? `That email looks mistyped. Did you mean ${r.suggestion}?` : 'That email address is not complete.';
    case 'bad-name':          return 'Enter your full name (2 to 80 characters).';
    case 'bad-phone':         return 'Enter the phone number with digits only, e.g. +256 700 123456.';
    case 'bad-photo':         return 'That photo could not be saved. Try a different picture.';
    case 'network':           return 'Could not reach the server. Check the connection and try again.';
    default:
      return isOldServer(r.error)
        ? 'Account settings are not switched on at the server yet. Ask the system admin to update the live script.'
        : `Not saved (${r.error}). Try again.`;
  }
}

// Centre-crop a picked image to a square and shrink it so it fits in one sheet
// cell. Resolves with a JPEG data URL.
export function resizePhoto(file, size = 192) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose a picture file (JPG or PNG).')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      let quality = 0.85;
      let out = canvas.toDataURL('image/jpeg', quality);
      while (out.length > PHOTO_MAX_CHARS && quality > 0.4) { quality -= 0.1; out = canvas.toDataURL('image/jpeg', quality); }
      if (out.length > PHOTO_MAX_CHARS) reject(new Error('That picture is too detailed to store. Try another one.'));
      else resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This picture format cannot be read here. Use a JPG or PNG.')); };
    img.src = url;
  });
}

export function initialsOf(name, fallback = '') {
  const parts = String(name || fallback || '').trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

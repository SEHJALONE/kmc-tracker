export const isKDC = (m = '') => m.toUpperCase().includes('KDC');
export const isEVS = (m = '') => m.toUpperCase().includes('EVS');

export function fmt(ms) {
  if (!ms || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? String(ts) : d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function getStatus(ms) {
  if (!ms) return 'On Track';
  if (ms > 48 * 3600000) return 'Delayed';
  if (ms > 24 * 3600000) return 'Slow';
  return 'On Track';
}

export async function fetchLogoBase64(path = '/kmc logo 2.png') {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

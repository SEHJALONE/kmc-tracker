import { useEffect, useMemo, useState } from 'react';
import { fetchSubmissions } from '../hooks/useSubmissionsData';
import { downloadStationReport, downloadBusReport } from '../export/travelCardReport';

// Pick any bus and any station it has a Travel Card for, then download that
// Station Report — or the Full Bus Report — without needing to have just
// submitted the card. Cards come live from the sheet, so every device sees the
// same list.
export default function ReportDownloadPanel({ theme = 'dark', vins = [] }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [vin, setVin] = useState('');
  const [cardId, setCardId] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let live = true;
    fetchSubmissions({ withDowntime: true })
      .then(c => { if (live) setCards(c); })
      .catch(() => { if (live) setErr('Could not load cards from the sheet.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const key = v => String(v || '').trim().toUpperCase();
  const allVins = useMemo(() => [...new Set([...vins, ...cards.map(c => c.vin)].map(v => String(v || '').trim()).filter(Boolean))].sort(), [vins, cards]);
  const forVin = useMemo(() => cards
    .filter(c => key(c.vin) === key(vin))
    .sort((a, b) => String(a.stationCode).localeCompare(String(b.stationCode), undefined, { numeric: true }) || new Date(b.timestamp) - new Date(a.timestamp)),
  [cards, vin]);
  const card = forVin.find(c => String(c.id ?? c.recordId ?? c.timestamp) === cardId) || null;
  const cardKey = c => String(c.id ?? c.recordId ?? c.timestamp);

  const dark = theme === 'dark';
  const sel = {
    background: dark ? 'rgba(255,255,255,0.05)' : '#fff', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, minWidth: 0, flex: '1 1 200px',
  };
  const btn = (on) => ({
    background: on ? '#dc2626' : 'transparent', color: on ? '#fff' : 'var(--text-muted)',
    border: `1px solid ${on ? '#dc2626' : 'var(--border)'}`, borderRadius: 6, padding: '8px 14px',
    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: on ? 'pointer' : 'not-allowed',
  });

  async function run(kind) {
    setBusy(kind); setErr('');
    try {
      if (kind === 'station') await downloadStationReport(card, { theme: 'light' });
      else await downloadBusReport(forVin, { theme: 'light', vin });
    } catch (e) { console.error(e); setErr('PDF generation failed.'); }
    finally { setBusy(''); }
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-heading)', marginBottom: 8 }}>
        Download a report
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={sel} value={vin} onChange={e => { setVin(e.target.value); setCardId(''); }} aria-label="Bus VIN">
          <option value="">{loading ? 'Loading buses…' : 'Choose a bus (VIN)'}</option>
          {allVins.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select style={sel} value={cardId} onChange={e => setCardId(e.target.value)} disabled={!vin} aria-label="Station">
          <option value="">{vin ? (forVin.length ? 'Choose a station' : 'No cards for this bus') : 'Choose a bus first'}</option>
          {forVin.map(c => (
            <option key={cardKey(c)} value={cardKey(c)}>
              {c.stationCode}{c.station ? ` — ${String(c.station).replace(/^[^:]+:\s*/, '')}` : ''} · {new Date(c.timestamp).toLocaleDateString()}
            </option>
          ))}
        </select>
        <button style={btn(!!card && !busy)} disabled={!card || !!busy} onClick={() => run('station')}>
          {busy === 'station' ? 'Preparing…' : 'Station report'}
        </button>
        <button style={btn(forVin.length > 0 && !busy)} disabled={!forVin.length || !!busy} onClick={() => run('bus')}>
          {busy === 'bus' ? 'Preparing…' : 'Full bus report'}
        </button>
      </div>
      {err && <div style={{ marginTop: 6, fontSize: 11, color: '#dc2626' }}>{err}</div>}
    </div>
  );
}

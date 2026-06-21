import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { fetchLogoBase64 } from '../export/exportHelpers';
import { buildWorkbook } from '../export/buildWorkbook';
import { buildSlidePDF } from '../export/buildSlidePDF';
import { buildPDF } from '../export/buildPDF';
import HiddenCoverSlide from './export/HiddenCoverSlide';
import EmailModal from './export/EmailModal';

export default function ExportPanel({ buses, rows, allRows, metrics, filters = {}, dashboardRef, slideRef, onPresent, stationTimes = {}, theme = 'dark' }) {
  rows = rows ?? allRows ?? [];
  const [busy,      setBusy]      = useState({});
  const [toast,     setToast]     = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const coverRef = useRef(null);
  const date = new Date().toISOString().slice(0, 10);

  function showToast(msg, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }
  function setLoading(key, val) { setBusy(b => ({ ...b, [key]: val })); }

  async function handleExcel() {
    setLoading('excel', true);
    try { XLSX.writeFile(buildWorkbook(buses, rows, metrics), `KMC_Dashboard_${date}.xlsx`); showToast('Excel downloaded ✓'); }
    catch (e) { console.error(e); showToast('Excel export failed', false); }
    finally { setLoading('excel', false); }
  }

  async function handlePDF() {
    setLoading('pdf', true);
    try {
      const logo = await fetchLogoBase64('/kmc logo.png');
      const doc  = await buildPDF(buses, rows, metrics, logo);
      doc.save(`KMC_Dashboard_${date}.pdf`);
      showToast('PDF downloaded ✓');
    } catch (e) { console.error(e); showToast('PDF export failed', false); }
    finally { setLoading('pdf', false); }
  }

  async function handleSlidePDF() {
    setLoading('scpdf', true);
    try {
      const logo = await fetchLogoBase64('/kmc logo 2.png');
      const doc  = await buildSlidePDF(buses, rows, metrics, logo);
      doc.save(`KMC_Presentation_${date}.pdf`);
      showToast('Presentation PDF downloaded ✓');
    } catch (e) { console.error(e); showToast('Slide PDF failed', false); }
    finally { setLoading('scpdf', false); }
  }

  async function handlePNG() {
    const el = coverRef?.current;
    if (!el) { showToast('Cover slide not ready', false); return; }
    setLoading('png', true);
    try {
      el.style.position = 'fixed';
      el.style.top = '-9999px';
      el.style.left = '0';
      el.style.visibility = 'visible';

      const canvas = await html2canvas(el, {
        backgroundColor: '#07090f', scale: 2,
        useCORS: true, logging: false,
        width: el.offsetWidth, height: el.offsetHeight,
      });

      el.style.position = 'fixed';
      el.style.top = '-9999px';
      el.style.left = '-9999px';

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `KMC_CoverSlide_${date}.png`;
      a.click();
      showToast('Cover slide PNG downloaded ✓');
    } catch (e) { console.error(e); showToast('PNG export failed', false); }
    finally { setLoading('png', false); }
  }

  const Spinner = () => (
    <div style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'epSpin 0.7s linear infinite', display: 'inline-block' }} />
  );

  const Btn = ({ id, color, border, icon, label, onClick, title }) => (
    <button onClick={onClick} disabled={!!busy[id]} title={title} style={{
      display: 'flex', alignItems: 'center', gap: 7,
      background: 'transparent',
      border: `1px solid ${busy[id] ? 'var(--border)' : border}`,
      borderRadius: 4, padding: '6px 14px',
      fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
      fontFamily: "'Inter', system-ui, sans-serif", cursor: busy[id] ? 'not-allowed' : 'pointer',
      color: busy[id] ? 'var(--text-dim)' : color, transition: 'all 0.15s',
    }}>
      {busy[id] ? <Spinner /> : icon}
      {label}
    </button>
  );

  const icons = {
    excel:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>,
    pdf:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6M9 11h3"/></svg>,
    cam:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
    png:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    email:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    present: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  };

  return (
    <div style={{ position: 'relative' }}>
      <style>{`@keyframes epSpin { to { transform: rotate(360deg); } }`}</style>

      <HiddenCoverSlide
        coverRef={coverRef}
        buses={buses}
        rows={rows}
        metrics={metrics}
        stationTimes={stationTimes}
      />

      {emailOpen && (
        <EmailModal
          onClose={() => setEmailOpen(false)}
          buses={buses}
          rows={rows}
          metrics={metrics}
          filters={filters}
          coverRef={coverRef}
          theme={theme}
        />
      )}

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--header-bg)', backdropFilter: 'blur(16px)',
        padding: '10px 32px',
      }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 4 }}>
          Export
        </span>

        <Btn id="excel" color="#16a34a" border="rgba(22,163,74,0.35)"   icon={icons.excel} label="Excel"       onClick={handleExcel}    title="Full Excel workbook (5 sheets)" />
        <Btn id="pdf"   color="#dc2626" border="rgba(220,38,38,0.35)"   icon={icons.pdf}   label="PDF Report"  onClick={handlePDF}      title="Formatted PDF report with KMC branding" />
        <Btn id="scpdf" color="#7c3aed" border="rgba(124,58,237,0.35)"  icon={icons.cam}   label="Slide PDF"   onClick={handleSlidePDF} title="Dark presentation-style PDF (cover + bus report pages)" />
        <Btn id="png"   color="#d97706" border="rgba(217,119,6,0.35)"   icon={icons.png}   label="PNG"         onClick={handlePNG}      title="Download cover slide as PNG" />

        <div style={{ width: 1, height: 22, background: 'var(--border-subtle)', margin: '0 4px' }} />

        <button
          onClick={onPresent}
          title="Open full-screen presentation slide deck"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'var(--accent-alpha)',
            border: '1px solid var(--accent-border)',
            borderRadius: 4, padding: '6px 16px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer',
            color: 'var(--accent-text)', transition: 'all 0.15s',
          }}
        >
          {icons.present}
          Present
        </button>

        <button
          onClick={() => setEmailOpen(true)}
          title="Schedule email delivery"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: theme === 'dark' ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.08)',
            border: `1px solid ${theme === 'dark' ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.4)'}`,
            borderRadius: 4, padding: '6px 14px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
            fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer',
            color: theme === 'dark' ? '#a5b4fc' : '#4f46e5', transition: 'all 0.15s',
          }}
        >
          {icons.email}
          Email Report
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.08em' }}>
          {buses.length} BUS{buses.length !== 1 ? 'ES' : ''} · {rows.length} RECORDS
        </span>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 60, right: 24, zIndex: 9999,
          background: toast.ok ? 'var(--success-alpha)' : 'var(--accent-alpha)',
          border: `1px solid ${toast.ok ? 'var(--success-border)' : 'var(--accent-border)'}`,
          borderLeft: `3px solid ${toast.ok ? 'var(--success-color)' : 'var(--accent)'}`,
          borderRadius: '0 6px 6px 0', padding: '10px 18px',
          fontSize: 12, fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.04em',
          color: toast.ok ? 'var(--success-color)' : 'var(--accent-text)', boxShadow: 'var(--shadow-card)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

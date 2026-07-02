import { useEffect, useRef, useState } from 'react';

// Supported extensions for format hint display
const FORMAT_LABELS = {
  stp: 'STEP', step: 'STEP', obj: 'OBJ', stl: 'STL',
  '3ds': '3DS', ply: 'PLY', gltf: 'GLTF', glb: 'GLB', fbx: 'FBX',
};

function getExtension(url) {
  try {
    const path = new URL(url).pathname;
    return path.split('.').pop().toLowerCase();
  } catch {
    return url.split('.').pop().toLowerCase();
  }
}

// ── CADViewer modal ───────────────────────────────────────────────────────────
// Props: modelUrl (string), title (string), onClose (fn)
export default function CADViewer({ modelUrl, title, onClose }) {
  const containerRef = useRef(null);
  const viewerRef    = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errMsg, setErrMsg] = useState('');

  const ext = getExtension(modelUrl || '');
  const fmt = FORMAT_LABELS[ext] || ext?.toUpperCase() || '3D';

  useEffect(() => {
    if (!modelUrl || !containerRef.current) return;

    let destroyed = false;

    async function initViewer() {
      try {
        // Dynamic import to keep the main bundle lean
        const OV = await import('online-3d-viewer');

        if (destroyed || !containerRef.current) return;

        // online-3d-viewer needs a physical size on the container
        const el = containerRef.current;

        const viewer = new OV.EmbeddedViewer(el, {
          camera: OV.GetDefaultCamera(OV.Direction.Y),
          environmentSettings: new OV.EnvironmentSettings(
            OV.GetDefaultEnvironment(),
            false
          ),
          backgroundColor: new OV.RGBAColor(30, 30, 40, 255),
          defaultColor: new OV.RGBColor(200, 200, 210),
          edgeSettings: new OV.EdgeSettings(false, new OV.RGBColor(0, 0, 0), 1),
          onModelLoaded: () => { if (!destroyed) setStatus('ready'); },
          onModelLoadError: (err) => {
            if (!destroyed) {
              setStatus('error');
              setErrMsg(err?.message || 'Could not load model. Check the URL and file format.');
            }
          },
        });

        viewerRef.current = viewer;
        viewer.LoadModelFromUrlList([modelUrl]);
      } catch (e) {
        if (!destroyed) {
          setStatus('error');
          setErrMsg('Viewer failed to initialise: ' + (e?.message || String(e)));
        }
      }
    }

    initViewer();

    return () => {
      destroyed = true;
      try { viewerRef.current?.Destroy?.(); } catch {}
      viewerRef.current = null;
    };
  }, [modelUrl]);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ width: '100%', maxWidth: 960, height: '85vh', display: 'flex', flexDirection: 'column', background: '#1a1c26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
          </svg>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title || '3D Model Viewer'}
          </span>
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: '#6366f122', color: '#818cf8', border: '1px solid #6366f133', fontFamily: 'monospace', flexShrink: 0 }}>{fmt}</span>
          {status === 'ready' && (
            <span style={{ fontSize: 9, color: '#10b981', flexShrink: 0 }}>● Loaded</span>
          )}
          <a
            href={modelUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 9, color: '#94a3b8', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', flexShrink: 0, fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            Download
          </a>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0 }}>✕</button>
        </div>

        {/* Viewer area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

          {/* Loading overlay */}
          {status === 'loading' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 1, background: '#1a1c26' }}>
              <div style={{ width: 36, height: 36, border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'cad-spin 0.9s linear infinite' }} />
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Loading {fmt} model…
              </div>
              <style>{`@keyframes cad-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 1, background: '#1a1c26', padding: 32 }}>
              <div style={{ fontSize: 32 }}>⚠</div>
              <div style={{ fontSize: 13, color: '#f87171', fontWeight: 700, fontFamily: "'Inter', system-ui, sans-serif" }}>Failed to load model</div>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: "'Inter', system-ui, sans-serif", textAlign: 'center', lineHeight: 1.6, maxWidth: 400 }}>
                {errMsg}
              </div>
              <div style={{ fontSize: 10, color: '#475569', fontFamily: "'Inter', system-ui, sans-serif", textAlign: 'center', lineHeight: 1.6, maxWidth: 440, marginTop: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                <strong style={{ color: '#94a3b8' }}>Supported formats:</strong> STEP (.stp/.step), OBJ, STL, 3DS, PLY, GLTF/GLB, FBX<br/>
                Ensure the file URL is publicly accessible (no login required to download it).
              </div>
              <a href={modelUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>Open file URL directly ↗</a>
            </div>
          )}

          {/* Viewer container — online-3d-viewer mounts here */}
          <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>

        {/* Footer controls hint */}
        {status === 'ready' && (
          <div style={{ display: 'flex', gap: 20, padding: '6px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, flexWrap: 'wrap' }}>
            {[
              ['Left drag', 'Rotate'],
              ['Right drag', 'Pan'],
              ['Scroll', 'Zoom'],
              ['Double-click', 'Focus part'],
            ].map(([key, label]) => (
              <div key={key} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ fontSize: 9, padding: '1px 5px', background: 'rgba(255,255,255,0.07)', borderRadius: 3, color: '#94a3b8', fontFamily: 'monospace' }}>{key}</span>
                <span style={{ fontSize: 9, color: '#475569', fontFamily: "'Inter', system-ui, sans-serif" }}>{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

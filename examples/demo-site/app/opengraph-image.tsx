import { ImageResponse } from 'next/og';

// Link-preview image for every page (generated once at build time).
export const alt = 'Knownsite: get your site found by search engines and AI assistants';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static'; // required by output: 'export'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '72px 80px', background: '#0b1b3a', color: '#f8fafc', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
          <svg width="60" height="60" viewBox="0 0 32 32"><path d="M7.5 6v20M18 11.5 8.3 19.6M12 17l6.2 8.6" fill="none" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="25.5" cy="24.5" r="3.4" fill="#22c55e" /></svg>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            knownsite
            <div style={{ width: 9, height: 9, borderRadius: 9, background: '#22c55e', marginLeft: -6, marginBottom: 11 }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
            Get your site found by search engines and AI assistants.
          </div>
          <div style={{ fontSize: 32, color: '#cbd5e1' }}>
            Free and open source. Runs on every deploy.
          </div>
        </div>
        <div style={{ fontSize: 30, color: '#94a3b8', fontFamily: 'monospace' }}>npx knownsite init</div>
      </div>
    ),
    size,
  );
}

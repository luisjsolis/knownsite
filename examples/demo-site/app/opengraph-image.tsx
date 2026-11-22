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
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>knownsite.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
            Get your site found by search engines and AI assistants.
          </div>
          <div style={{ fontSize: 32, color: '#cbd5e1' }}>
            Free and open source. Runs on every deploy.
          </div>
        </div>
        <div style={{ fontSize: 30, color: '#94a3b8', fontFamily: 'monospace' }}>npx knownsite check your-site.com</div>
      </div>
    ),
    size,
  );
}

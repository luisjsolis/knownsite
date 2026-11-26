import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import './globals.css';
import { SITE, SALES_EMAIL } from './meta';
import LiveChat from './components/LiveChat';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Knownsite', template: '%s · Knownsite' },
  description:
    'An open standard that makes every website discoverable by search engines and AI assistants the moment it is deployed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7.5 6v20M18 11.5 8.3 19.6M12 17l6.2 8.6" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="25.5" cy="24.5" r="3.4" fill="var(--brand-green)" /></svg>
              <span><span className="brand-name">knownsite<span className="brand-dot">.</span></span><span className="brand-sub">by WellnessLabs</span></span>
            </Link>
            <nav className="site-nav">
              <Link href="/how-it-works" className="hide-sm">How it works</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/spec" className="hide-sm">Spec</Link>
              <Link href="/blog" className="hide-sm">Blog</Link>
              <Link href="/check" className="nav-cta">Check your site</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <LiveChat id={process.env.NEXT_PUBLIC_CRISP_ID ?? ''} />
        <footer className="site-footer">
          <div className="site-footer-inner">
            <span>Knownsite by WellnessLabs · open standard, spec CC BY 4.0, code MIT</span>
            <span className="footer-links">
              <Link href="/check">Check your site</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/spec">Spec</Link>
              <Link href="/discovery">Live report</Link>
              <Link href="/sites">Directory</Link>
              <Link href="/study/ai-crawler-access">AI crawler study</Link>
              <a href="https://github.com/luisjsolis/knownsite">GitHub</a>
              <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

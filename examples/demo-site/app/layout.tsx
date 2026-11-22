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
              <a href="https://github.com/luisjsolis/knownsite">GitHub</a>
              <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

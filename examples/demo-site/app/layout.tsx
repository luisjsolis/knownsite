import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { SITE } from './meta';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Knownsite', template: '%s · Knownsite' },
  description:
    'An open standard that makes every website discoverable by search engines and AI assistants the moment it is deployed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">Knownsite</Link>
          <nav>
            <Link href="/check">Check your site</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/spec">Spec</Link>
            <Link href="/discovery">Live report</Link>
            <Link href="/blog">Blog</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          Knownsite Protocol · draft 0.1 · spec CC BY 4.0 · code MIT
        </footer>
      </body>
    </html>
  );
}

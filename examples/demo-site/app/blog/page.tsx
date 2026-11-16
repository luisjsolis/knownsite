import type { Metadata } from 'next';
import Link from 'next/link';
import { posts } from './posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'News and notes on the Knownsite Protocol.',
};

export default function Blog() {
  return (
    <>
      <h1>Blog</h1>
      {posts.map((p) => (
        <div className="card" key={p.slug}>
          <h2 style={{ margin: 0 }}><Link href={`/blog/${p.slug}`}>{p.title}</Link></h2>
          <p className="muted" style={{ margin: '4px 0' }}>{p.date}</p>
          <p style={{ margin: 0 }}>{p.summary}</p>
        </div>
      ))}
    </>
  );
}

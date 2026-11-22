import { pageMeta } from '../../meta';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { posts } from '../posts';

export const dynamicParams = false;

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  return post ? pageMeta(`/blog/${post.slug}`, post.title, post.summary) : {};
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts.find((p) => p.slug === slug);
  if (!post) notFound();
  return (
    <article>
      <h1>{post.title}</h1>
      <p className="muted">{post.date}</p>
      {post.body.map((para, i) => <p key={i}>{para}</p>)}
    </article>
  );
}

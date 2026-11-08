import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { TopBar } from '@/components/shell/TopBar';
import { Footer } from '@/components/shell/Footer';
import { DOC_CHAPTERS, DocChapter } from '@/lib/docs-content';
import {
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Clock,
  ExternalLink,
  Share2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface DocPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return DOC_CHAPTERS.map((chap) => ({
    slug: chap.slug,
  }));
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { slug } = await params;
  const chapter = DOC_CHAPTERS.find((c) => c.slug === slug);

  if (!chapter) {
    return {
      title: 'Documentation Not Found | Elvaris Capital',
    };
  }

  return {
    title: `${chapter.title} — Elvaris Capital Documentation`,
    description: `${chapter.seoDescription} Product by Elvaris Capital (parent organization: elvariscapital.in).`,
    keywords: [...chapter.keywords, 'Elvaris Capital', 'elvariscapital.in'],
    alternates: {
      canonical: `https://elvariscapital.in/docs/${chapter.slug}`,
    },
    openGraph: {
      title: `${chapter.title} — Elvaris Capital Documentation`,
      description: chapter.seoDescription,
      url: `https://elvariscapital.in/docs/${chapter.slug}`,
      siteName: 'Elvaris Capital',
      images: [
        {
          url: '/images/logo.png',
          width: 800,
          height: 800,
          alt: 'Elvaris Capital Documentation',
        },
      ],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${chapter.title} — Elvaris Capital`,
      description: chapter.seoDescription,
      images: ['/images/logo.png'],
    },
  };
}

export default async function DocChapterPage({ params }: DocPageProps) {
  const { slug } = await params;
  const chapter = DOC_CHAPTERS.find((c) => c.slug === slug);

  if (!chapter) {
    notFound();
  }

  const currentIndex = DOC_CHAPTERS.findIndex((c) => c.slug === slug);
  const prevChapter = currentIndex > 0 ? DOC_CHAPTERS[currentIndex - 1] : null;
  const nextChapter = currentIndex < DOC_CHAPTERS.length - 1 ? DOC_CHAPTERS[currentIndex + 1] : null;

  // JSON-LD TechArticle Structured Data for SEO
  const jsonLdArticle = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: chapter.title,
    description: chapter.seoDescription,
    url: `https://elvariscapital.in/docs/${chapter.slug}`,
    author: {
      '@type': 'Organization',
      name: 'Elvaris Capital',
      url: 'https://elvariscapital.in',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Elvaris Capital',
      url: 'https://elvariscapital.in',
      logo: {
        '@type': 'ImageObject',
        url: 'https://elvariscapital.in/images/logo.png',
      },
    },
    dateModified: '2026-11-08',
    inLanguage: 'en-US',
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col selection:bg-[var(--brand-soft)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdArticle) }}
      />
      <TopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* ─── Left Sidebar Navigation ─── */}
          <aside className="lg:col-span-1 space-y-6">
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--brand)] hover:underline mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>All Documentation</span>
            </Link>

            <div className="bg-white rounded-2xl border border-[var(--border-subtle)] p-4 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <BookOpen className="w-4 h-4 text-[var(--brand)]" />
                <span className="text-xs font-bold text-[var(--text-1)] uppercase tracking-wider">
                  Chapters
                </span>
              </div>

              <nav className="space-y-1">
                {DOC_CHAPTERS.map((c) => {
                  const isActive = c.slug === chapter.slug;
                  return (
                    <Link
                      key={c.slug}
                      href={`/docs/${c.slug}`}
                      className={`block px-3 py-2 rounded-xl text-xs transition-colors ${
                        isActive
                          ? 'bg-[var(--brand)] text-white font-bold shadow-xs'
                          : 'text-[var(--text-2)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      <span className="text-[10px] opacity-80 block uppercase tracking-wider font-mono">
                        {c.category}
                      </span>
                      <span className="truncate block font-medium mt-0.5">{c.title}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Parent Org Attribution Box */}
            <div className="p-4 rounded-2xl bg-white border border-[var(--border-subtle)] shadow-xs space-y-2 text-xs">
              <span className="font-bold text-[var(--text-1)] block">Parent Organization</span>
              <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
                Elvaris Capital quantitative algorithms, strategy templates, and backtest infrastructure are maintained by Elvaris Capital.
              </p>
              <a
                href="https://elvariscapital.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[var(--brand)] hover:underline inline-flex items-center gap-1 pt-1"
              >
                <span>elvariscapital.in</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </aside>

          {/* ─── Main Article Content ─── */}
          <article className="lg:col-span-3 bg-white rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-10 shadow-xs space-y-8">
            {/* Header Metadata */}
            <div className="space-y-4 pb-6 border-b border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2.5 py-1 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] text-[11px] font-bold uppercase tracking-wider">
                  {chapter.category}
                </span>

                <div className="flex items-center gap-4 text-xs font-mono text-[var(--text-3)]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{chapter.readTime}</span>
                  </span>
                  <span>&middot;</span>
                  <span>{chapter.lastUpdated}</span>
                </div>
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold text-[var(--text-1)] tracking-tight">
                {chapter.title}
              </h1>

              <p className="text-sm text-[var(--text-2)] leading-relaxed font-medium">
                {chapter.subtitle}
              </p>

              {/* Attribution Callout */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-blue-900">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  Official Engineering Documentation &middot; Product by <strong>Elvaris Capital</strong> &middot; Parent Organization: <a href="https://elvariscapital.in" target="_blank" rel="noopener noreferrer" className="underline font-bold">elvariscapital.in</a>
                </span>
              </div>
            </div>

            {/* Article Prose Body */}
            <div className="prose prose-slate max-w-none text-xs sm:text-sm leading-relaxed space-y-6">
              {chapter.content
                .split('\n\n')
                .filter((p) => !p.startsWith('# ') && !p.startsWith('**Product by Elvaris'))
                .map((paragraph, idx) => {
                  // H2 headings
                  if (paragraph.startsWith('## ')) {
                    return (
                      <h2
                        key={idx}
                        className="text-lg sm:text-xl font-bold text-[var(--text-1)] pt-4 pb-1 border-b border-[var(--border-subtle)] tracking-tight"
                      >
                        {paragraph.replace('## ', '')}
                      </h2>
                    );
                  }
                  // H3 headings
                  if (paragraph.startsWith('### ')) {
                    return (
                      <h3 key={idx} className="text-sm sm:text-base font-bold text-[var(--text-1)] pt-2 tracking-tight">
                        {paragraph.replace('### ', '')}
                      </h3>
                    );
                  }
                  // Tables
                  if (paragraph.includes('| :---') || paragraph.startsWith('|')) {
                    const lines = paragraph.split('\n').filter((l) => l.trim().length > 0);
                    const headerLine = lines[0];
                    const headers = headerLine
                      .split('|')
                      .filter((h) => h.trim().length > 0)
                      .map((h) => h.trim());
                    const rowLines = lines.slice(2);

                    return (
                      <div key={idx} className="border border-[var(--border-subtle)] rounded-xl overflow-hidden my-4">
                        <table className="w-full text-xs font-mono text-left">
                          <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)] text-[var(--text-2)] font-semibold">
                            <tr>
                              {headers.map((h, hi) => (
                                <th key={hi} className="py-2 px-3">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {rowLines.map((row, ri) => {
                              const cells = row
                                .split('|')
                                .filter((c) => c.trim().length > 0)
                                .map((c) => c.trim());
                              return (
                                <tr key={ri} className="hover:bg-[var(--bg-subtle)]/40">
                                  {cells.map((cell, ci) => (
                                    <td key={ci} className="py-2 px-3 text-[var(--text-1)]">
                                      {cell.replace(/`/g, '')}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                  // Code Blocks
                  if (paragraph.startsWith('```')) {
                    const lines = paragraph.split('\n');
                    const lang = lines[0].replace('```', '');
                    const code = lines.slice(1, -1).join('\n');
                    return (
                      <div key={idx} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 my-4 shadow-sm">
                        <div className="px-4 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                          <span>{lang || 'code'}</span>
                          <span>Elvaris Verified</span>
                        </div>
                        <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed">
                          <code>{code}</code>
                        </pre>
                      </div>
                    );
                  }
                  // Bullet lists
                  if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
                    const items = paragraph.split('\n').filter((l) => l.trim().length > 0);
                    return (
                      <ul key={idx} className="list-disc pl-5 space-y-1.5 text-xs text-[var(--text-2)]">
                        {items.map((item, ii) => (
                          <li key={ii} className="leading-relaxed">
                            {item.replace(/^[-*]\s+/, '')}
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  // Standard prose paragraph
                  return (
                    <p key={idx} className="text-xs sm:text-sm text-[var(--text-2)] leading-relaxed">
                      {paragraph}
                    </p>
                  );
                })}
            </div>

            {/* Next / Previous Navigation */}
            <div className="pt-8 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4">
              {prevChapter ? (
                <Link
                  href={`/docs/${prevChapter.slug}`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--brand)] text-xs font-semibold text-[var(--text-1)] hover:text-[var(--brand)] transition-colors w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <div className="text-left">
                    <span className="text-[10px] text-[var(--text-3)] block font-normal">Previous</span>
                    <span>{prevChapter.title}</span>
                  </div>
                </Link>
              ) : <div />}

              {nextChapter && (
                <Link
                  href={`/docs/${nextChapter.slug}`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--brand)] text-xs font-semibold text-[var(--text-1)] hover:text-[var(--brand)] transition-colors w-full sm:w-auto text-right ml-auto"
                >
                  <div className="text-right">
                    <span className="text-[10px] text-[var(--text-3)] block font-normal">Next</span>
                    <span>{nextChapter.title}</span>
                  </div>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}


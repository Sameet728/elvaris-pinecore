'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/shell/TopBar';
import { Footer } from '@/components/shell/Footer';
import { DOC_CHAPTERS } from '@/lib/docs-content';
import {
  BookOpen,
  Search,
  ArrowRight,
  Clock,
  ExternalLink,
  Cpu,
  Sliders,
  ShieldCheck,
  FileCode,
  Globe,
  Sparkles,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Engine Core': Cpu,
  'Optimization': Sliders,
  'Audit & Parity': ShieldCheck,
  'Risk Management': Globe,
  'Developer & API': FileCode,
};

export default function DocsIndexPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const categories = useMemo(() => {
    const set = new Set(DOC_CHAPTERS.map((c) => c.category));
    return ['ALL', ...Array.from(set)];
  }, []);

  const filteredChapters = useMemo(() => {
    return DOC_CHAPTERS.filter((chap) => {
      const matchCat = selectedCategory === 'ALL' || chap.category === selectedCategory;
      if (!matchCat) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        chap.title.toLowerCase().includes(q) ||
        chap.subtitle.toLowerCase().includes(q) ||
        chap.category.toLowerCase().includes(q) ||
        chap.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [search, selectedCategory]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex flex-col selection:bg-[var(--brand-soft)]">
      <TopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* ─── Hero Header & Attribution ─── */}
        <div className="bg-white rounded-3xl border border-[var(--border-subtle)] p-6 sm:p-10 shadow-xs relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] text-xs font-semibold">
              <BookOpen className="w-3.5 h-3.5" />
              <span>ELVARIS QUANTITATIVE KNOWLEDGE BASE</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-[var(--text-1)] tracking-tight">
              Algorithmic Documentation & Engineering Specs
            </h1>

            <p className="text-sm text-[var(--text-2)] leading-relaxed">
              Explore exhaustive technical specifications for the <strong>Elvaris Capital Quantitative Pine Script Engine</strong>. 
              Covering 100% TradingView Strategy Tester parity, multi-variable Monte Carlo bootstrap simulations, 
              MetaTrader 5 institutional metrics, and Tradeify prop firm compliance rules.
            </p>

            {/* Parent Organization Card */}
            <div className="inline-flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs">
              <div className="flex items-center gap-1.5 font-medium text-[var(--text-2)]">
                <span>Product by <strong>Elvaris Capital</strong></span>
                <span>&middot;</span>
                <span>Parent Organization:</span>
              </div>
              <a
                href="https://elvariscapital.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[var(--brand)] hover:underline inline-flex items-center gap-1"
              >
                <span>elvariscapital.in</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-linear-to-l from-[var(--brand)]/5 to-transparent pointer-events-none hidden lg:block" />
        </div>

        {/* ─── Search & Category Filter Strip ─── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documentation, Pine Script rules, Monte Carlo..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-white text-[var(--text-1)] focus:outline-hidden focus:ring-2 focus:ring-[var(--brand)] shadow-2xs"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[var(--brand)] text-white shadow-xs'
                    : 'bg-white text-[var(--text-2)] border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Chapter Grid ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChapters.map((chap) => {
            const Icon = CATEGORY_ICONS[chap.category] || BookOpen;
            return (
              <Link
                key={chap.slug}
                href={`/docs/${chap.slug}`}
                className="group flex flex-col justify-between p-6 rounded-2xl bg-white border border-[var(--border-subtle)] hover:border-[var(--brand)] hover:shadow-md transition-all space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="p-2 rounded-xl bg-[var(--bg-subtle)] text-[var(--brand)] group-hover:bg-[var(--brand)] group-hover:text-white transition-colors">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-3)] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{chap.readTime}</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand)] block mb-1">
                      {chap.category}
                    </span>
                    <h3 className="text-base font-bold text-[var(--text-1)] group-hover:text-[var(--brand)] transition-colors leading-snug">
                      {chap.title}
                    </h3>
                  </div>

                  <p className="text-xs text-[var(--text-3)] line-clamp-2 leading-relaxed">
                    {chap.subtitle}
                  </p>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-semibold text-[var(--brand)]">
                  <span>Read Chapter</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>

        {filteredChapters.length === 0 && (
          <div className="p-12 text-center bg-white border border-[var(--border-subtle)] rounded-2xl">
            <p className="text-sm text-[var(--text-3)]">No documentation chapters found matching &quot;{search}&quot;.</p>
          </div>
        )}

        {/* ─── LLMs & AI Web Crawlers Banner ─── */}
        <div className="p-6 rounded-2xl bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">AI Bot & Agent Integration Standard</h3>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl">
              We provide structured machine-readable knowledge files (<code className="bg-white px-1.5 py-0.5 rounded border border-blue-200">llms.txt</code>) for ChatGPT, Claude, Perplexity, and Gemini to index Elvaris Capital algorithms with 100% fidelity.
            </p>
          </div>

          <a
            href="/llms.txt"
            target="_blank"
            className="px-4 py-2 rounded-xl bg-white border border-blue-300 text-indigo-700 font-bold text-xs hover:bg-blue-100 transition-colors shrink-0 shadow-2xs"
          >
            View /llms.txt
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}


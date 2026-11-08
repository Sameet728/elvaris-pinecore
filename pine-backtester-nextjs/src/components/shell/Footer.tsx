'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink, ShieldCheck, Cpu, BarChart3, BookOpen, Layers, Sliders, Globe } from 'lucide-react';

export function Footer() {
  return (
    <footer
      itemScope
      itemType="https://schema.org/WPFooter"
      className="bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] text-[var(--text-2)] text-xs mt-auto select-none"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1: Brand & Parent Organization Attribution */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-[var(--border-subtle)] flex items-center justify-center p-0.5 shadow-xs shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/logo.png" alt="Elvaris Capital" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-[var(--text-1)] tracking-tight">Elvaris Capital</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--brand)]/10 text-[var(--brand)] uppercase tracking-wider">
                    Official
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-3)] block">Quantitative Pine Script Platform</span>
              </div>
            </div>

            <p className="text-xs text-[var(--text-3)] leading-relaxed max-w-md">
              A flagship algorithmic quantitative platform engineered by <strong>Elvaris Capital</strong>. 
              Built for high-precision Pine Script v5 strategy backtesting, multi-variable Monte Carlo optimization, 
              TradingView execution parity, and MetaTrader 5 (MT5) institutional reporting.
            </p>

            {/* Parent Organization Link Banner */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs">
              <Globe className="w-3.5 h-3.5 text-[var(--brand)]" />
              <span className="text-[var(--text-3)]">Parent Organization:</span>
              <a
                href="https://elvariscapital.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[var(--brand)] hover:underline inline-flex items-center gap-1"
                title="Visit Elvaris Capital Parent Organization"
              >
                <span>elvariscapital.in</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Col 2: Platform Links */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)]">
              Quantitative Platform
            </h4>
            <ul className="space-y-1.5 text-xs text-[var(--text-3)] font-medium">
              <li>
                <Link href="/" className="hover:text-[var(--text-1)] transition-colors flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[var(--brand)]" />
                  <span>Interactive Workspace</span>
                </Link>
              </li>
              <li>
                <Link href="/optimize" className="hover:text-[var(--text-1)] transition-colors flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[var(--brand)]" />
                  <span>Monte Carlo Optimizer</span>
                </Link>
              </li>
              <li>
                <Link href="/strategies" className="hover:text-[var(--text-1)] transition-colors flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[var(--brand)]" />
                  <span>Champion Strategies</span>
                </Link>
              </li>
              <li>
                <Link href="/data" className="hover:text-[var(--text-1)] transition-colors flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-[var(--brand)]" />
                  <span>Historical Data Vault</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Documentation & SEO Knowledge Hub */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)]">
              Knowledge & Guides
            </h4>
            <ul className="space-y-1.5 text-xs text-[var(--text-3)] font-medium">
              <li>
                <Link href="/docs" className="hover:text-[var(--text-1)] transition-colors flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[var(--brand)]" />
                  <span>Documentation Hub</span>
                </Link>
              </li>
              <li>
                <Link href="/docs/pine-script-v5" className="hover:text-[var(--text-1)] transition-colors">
                  Pine Script v5 Parity Guide
                </Link>
              </li>
              <li>
                <Link href="/docs/monte-carlo" className="hover:text-[var(--text-1)] transition-colors">
                  Monte Carlo Methodology
                </Link>
              </li>
              <li>
                <Link href="/docs/mt5-audit" className="hover:text-[var(--text-1)] transition-colors">
                  MetaTrader 5 Audit Standards
                </Link>
              </li>
              <li>
                <Link href="/docs/prop-firm-calibration" className="hover:text-[var(--text-1)] transition-colors">
                  Tradeify & Prop Firm Rules
                </Link>
              </li>
              <li>
                <Link href="/docs/api-reference" className="hover:text-[var(--text-1)] transition-colors">
                  REST API & Engine Specs
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright, Verification, & Regulatory Notice */}
        <div className="pt-6 border-t border-[var(--border-subtle)] flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-[var(--text-3)] font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              &copy; 2026 <strong>Elvaris Capital</strong>. All rights reserved. Parent organization: 
              <a
                href="https://elvariscapital.in"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--brand)] ml-1"
              >
                elvariscapital.in
              </a>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a href="/sitemap.xml" className="hover:underline">Sitemap</a>
            <span>·</span>
            <a href="/robots.txt" className="hover:underline">Robots</a>
            <span>·</span>
            <a href="/llms.txt" className="hover:underline text-[var(--brand)]">llms.txt (AI Knowledge)</a>
            <span>·</span>
            <span>SHA-256: 1ae699f6b4f7e2a8</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

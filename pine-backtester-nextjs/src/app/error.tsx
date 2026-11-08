'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Next.js Application Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center p-6 text-[var(--text-1)] select-none">
      <div className="max-w-md w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-8 shadow-xl text-center space-y-6">
        {/* Brand / Logo */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-[var(--border-subtle)] p-1 flex items-center justify-center shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Elvaris Capital" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-base tracking-tight text-[var(--text-1)]">Elvaris Capital</span>
        </div>

        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Workspace Session Interrupted</h2>
          <p className="text-xs text-[var(--text-2)] leading-relaxed">
            The quantitative engine encountered an unexpected runtime exception. Your saved strategies and settings are safe.
          </p>
        </div>

        {error.message && (
          <div className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-lg text-left">
            <span className="text-[10px] font-mono text-[var(--text-3)] block uppercase">Diagnostic</span>
            <code className="text-[11px] font-mono text-rose-600 break-all line-clamp-3">
              {error.message}
            </code>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={() => reset()}
            className="flex-1 gap-2 bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90 h-10 font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reload Session</span>
          </Button>

          <Link href="/" className="flex-1">
            <Button
              variant="outline"
              className="w-full gap-2 h-10 border-[var(--border-subtle)] font-medium"
            >
              <Home className="w-4 h-4" />
              <span>Workspace</span>
            </Button>
          </Link>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-3)] flex items-center justify-center gap-1.5">
          <LifeBuoy className="w-3.5 h-3.5" />
          <span>Elvaris Quant Diagnostic Engine &middot; Build 2026.11</span>
        </div>
      </div>
    </div>
  );
}


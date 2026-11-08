'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'sans-serif', background: '#F8FAFC', color: '#0F172A' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '440px', width: '100%', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '32px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '24px' }}>
              ⚠
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 8px 0' }}>Elvaris Capital System Notice</h2>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5', margin: '0 0 20px 0' }}>
              An unexpected system condition occurred. Please reload to restore the active workspace.
            </p>
            {error?.message && (
              <p style={{ fontSize: '11px', fontFamily: 'monospace', color: '#E11D48', background: '#FFF1F2', padding: '8px', borderRadius: '6px', textAlign: 'left', wordBreak: 'break-all', margin: '0 0 20px 0' }}>
                {error.message}
              </p>
            )}
            <button
              onClick={() => reset()}
              style={{ width: '100%', height: '40px', background: '#0284C7', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
            >
              Restore Workspace
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}


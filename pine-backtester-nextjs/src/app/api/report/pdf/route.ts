import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { storeReport } from '@/lib/report-store';
import crypto from 'crypto';

export const maxDuration = 60; // Allow sufficient time for Playwright rendering

export async function POST(req: NextRequest) {
  let browser = null;
  try {
    const body = await req.json();
    const { result } = body;

    if (!result) {
      return NextResponse.json({ error: 'Missing backtest result' }, { status: 400 });
    }

    // Generate unique report ID and cache result in store
    const reportId = crypto.randomUUID();
    storeReport(reportId, result);

    const rawHost = req.headers.get('host') || '127.0.0.1:3005';
    const port = rawHost.includes(':') ? rawHost.split(':')[1] : '3005';
    // Use 127.0.0.1 directly to avoid IPv6 localhost resolution delays on Windows
    const printUrl = `http://127.0.0.1:${port}/report/print?id=${reportId}`;

    // Launch headless Chromium with reliable server arguments
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
      ],
    });

    const page = await browser.newPage({
      viewport: { width: 1200, height: 1600 },
      deviceScaleFactor: 2, // High resolution crisp rendering
    });

    // In-memory injection: pass the backtest result directly to the page before mount!
    await page.addInitScript((data) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__PRELOADED_REPORT__ = data;
        localStorage.setItem('elvaris_current_report', JSON.stringify(data));
      } catch {}
    }, result);

    // Navigate to the printable report page with networkidle wait
    await page.goto(printUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for the report header and report ready flag
    await page.waitForSelector('header', { timeout: 15000 });
    await page.waitForFunction(() => (window as any).__REPORT_READY__ === true, {
      timeout: 15000,
    }).catch(() => {
      return new Promise((resolve) => setTimeout(resolve, 1500));
    });

    // Generate PDF buffer with A4 format
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm',
      },
      displayHeaderFooter: false,
    });

    await browser.close();
    browser = null;

    const safeTitle = (result.strategyTitle || result.symbol || 'Backtest_Report')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Elvaris_${safeTitle}_Audit_Report.pdf`;

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('PDF Generation Error:', err);
    if (browser) {
      await browser.close().catch(() => {});
    }
    return NextResponse.json(
      { error: 'PDF Generation Failed', details: err.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getReport, storeReport } from '@/lib/report-store';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing report id' }, { status: 400 });
  }

  const result = getReport(id);
  if (!result) {
    return NextResponse.json({ error: 'Report not found or expired' }, { status: 404 });
  }

  return NextResponse.json({ result });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, result } = body;

    if (!id || !result) {
      return NextResponse.json({ error: 'Missing id or result' }, { status: 400 });
    }

    storeReport(id, result);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

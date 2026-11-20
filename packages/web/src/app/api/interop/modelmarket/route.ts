import { NextResponse } from 'next/server';
import { runModelMarketInterop } from '@/lib/interop/modelmarket';

export async function POST() {
  return NextResponse.json(await runModelMarketInterop(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

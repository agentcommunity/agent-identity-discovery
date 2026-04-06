import { NextResponse } from 'next/server';
import { AID_VERSION } from '@/generated/version';

export function GET() {
  return NextResponse.json({ version: AID_VERSION });
}

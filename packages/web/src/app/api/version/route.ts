import { NextResponse } from 'next/server';
import { AID_SDK_VERSION, AID_SPEC_VERSION } from '@/generated/version';

export function GET() {
  return NextResponse.json({
    version: AID_SPEC_VERSION,
    specVersion: AID_SPEC_VERSION,
    sdkVersion: AID_SDK_VERSION,
  });
}

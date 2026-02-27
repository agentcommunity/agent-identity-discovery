import { NextResponse } from 'next/server';
import { validateGeneratorPayload } from '@/lib/api/generator-validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const response = validateGeneratorPayload(payload);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      {
        success: false,
        txt: '',
        json: { v: 'aid1' },
        bytes: { txt: 0, desc: 0 },
        errors: [{ code: 'ERR_BODY', message: 'Invalid JSON body' }],
        warnings: [],
        suggestAliases: true,
      },
      { status: 400 },
    );
  }
}

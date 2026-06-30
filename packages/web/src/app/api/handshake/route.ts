import { NextResponse } from 'next/server';
import { handleProtocol } from '@/lib/protocols';
import type { ProtocolToken } from '@/lib/protocols';
import {
  authTypeFromHint,
  parseHandshakeRequestBody,
  type AuthCredentials,
} from '@/lib/api/handshake-validation';
import { getSecurityInfo } from '@/lib/api/handshake-security';
import { isPrivateHost } from '@/lib/api/ssrf';

export const runtime = 'nodejs';

type SupportedScheme = 'http:' | 'https:' | 'ws:' | 'wss:';

interface AuthErrorResult {
  body: Record<string, unknown>;
  status: number;
}

const safeHostFromUri = (uri: string): string => {
  try {
    return new URL(uri).host;
  } catch {
    return uri.split('/')[0] || uri;
  }
};

const buildAuthError = (
  error: unknown,
  uri: string,
  authHint?: string,
  compliantAuth = false,
  metadataUri?: string,
): AuthErrorResult => {
  const message = error instanceof Error ? error.message : String(error);
  const body: Record<string, unknown> = {
    success: false,
    error: message,
    needsAuth: true,
    compliantAuth,
    authType: authTypeFromHint(uri, authHint, compliantAuth),
  };

  if (metadataUri) {
    body.metadataUri = metadataUri;
  }

  return { body, status: 401 };
};

export async function POST(request: Request) {
  const parsed = await safeParseBody(request);
  if (!parsed.ok) {
    return NextResponse.json(parsed.error, { status: 400 });
  }

  const { uri, proto: protoParam, auth, authHint } = parsed.value;
  const proto: ProtocolToken = protoParam || 'mcp';

  try {
    const url = new URL(uri);
    if (isPrivateHost(url.hostname)) {
      return NextResponse.json(
        { success: false, error: 'Target host not allowed' },
        { status: 400 },
      );
    }

    if (!isSupportedScheme(url.protocol as SupportedScheme) && proto === 'mcp') {
      return NextResponse.json(
        {
          success: false,
          needsAuth: true,
          compliantAuth: false,
          authType: authTypeFromHint(uri, authHint, false),
          error:
            `Unsupported URI scheme: ${url.protocol}. ` +
            'Provide a Personal Access Token or run a local proxy.',
        },
        { status: 401 },
      );
    }
  } catch {
    // Non-URL schemes (npx:, docker:, pip:, zeroconf:) are handled by protocol handlers.
  }

  let isCompliantAuth = false;
  let authMetadataUri: string | undefined;

  if (proto === 'mcp') {
    try {
      const url = new URL(uri);
      if (url.protocol.startsWith('http')) {
        const probe = await fetch(url.toString(), {
          method: 'HEAD',
          redirect: 'manual',
          signal: AbortSignal.timeout(3000),
        });
        if (probe.status === 401) {
          const headerValue = probe.headers.get('www-authenticate') ?? undefined;
          const metadataMatch = headerValue?.match(/as_uri="([^"]+)"/i);
          if (metadataMatch) {
            isCompliantAuth = true;
            authMetadataUri = metadataMatch[1];
          }
        }
      }
    } catch {
      // Probe failures are non-fatal.
    }
  }

  try {
    const result = await handleProtocol({ uri, proto, auth });

    let security: Record<string, unknown> | undefined;
    try {
      const hostname = safeHostFromUri(uri).split(':')[0];
      if (hostname && !isPrivateHost(hostname)) {
        security = await getSecurityInfo(hostname);
      }
    } catch {
      // Best-effort security enrichment only.
    }

    if (result.success) {
      const response: Record<string, unknown> = {
        success: true,
        proto: result.proto,
        security,
      };

      if (result.data) {
        response.data = {
          ...result.data,
          security: security || result.data.security,
        };
      }
      if (result.agentCard) {
        response.agentCard = result.agentCard;
      }
      if (result.guidance) {
        response.guidance = result.guidance;
      }

      return NextResponse.json(response);
    }

    if (result.needsAuth) {
      const { body, status } = buildAuthError(
        new Error(result.error || 'Authentication required'),
        uri,
        authHint,
        result.compliantAuth ?? isCompliantAuth,
        result.metadataUri || authMetadataUri,
      );
      return NextResponse.json(body, { status });
    }

    return NextResponse.json(
      {
        success: false,
        error: result.error || 'Protocol handling failed',
      },
      { status: 500 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const needsAuth = /401|403|unauthori[sz]ed/i.test(message);

    if (needsAuth) {
      const { body, status } = buildAuthError(
        error,
        uri,
        authHint,
        isCompliantAuth,
        authMetadataUri,
      );
      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

const isSupportedScheme = (protocol: SupportedScheme): boolean =>
  ['http:', 'https:', 'ws:', 'wss:'].includes(protocol);

const safeParseBody = async (
  request: Request,
): Promise<
  | {
      ok: true;
      value: { uri: string; proto?: ProtocolToken; auth?: AuthCredentials; authHint?: string };
    }
  | { ok: false; error: { success: false; error: string } }
> => {
  try {
    const payload = (await request.json()) as unknown;
    return parseHandshakeRequestBody(payload);
  } catch {
    return { ok: false, error: { success: false, error: 'Invalid JSON body' } };
  }
};

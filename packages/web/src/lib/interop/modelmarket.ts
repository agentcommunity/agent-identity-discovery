import { parse, performPKAHandshake } from '@agentcommunity/aid';

const domain = 'modelmarket.dev';
const dnsName = '_agent.modelmarket.dev';
const endpoint = 'https://modelmarket.dev/mcp';
const manifestUrl = 'https://modelmarket.dev/.well-known/ard.json';
const cardUrl = 'https://modelmarket.dev/mcp/server-card';
const cardIdentifier = 'urn:air:modelmarket.dev:mcp:gateway';
const timeout = 5000;
const maxResponseBytes = 1024 ** 2;
const proofCases = [
  { id: 'unbound', requestedDomain: undefined, expected: 'Verified unbound proof' },
  { id: 'bound', requestedDomain: domain, expected: 'Verified domain-bound proof' },
  { id: 'wrong-domain', requestedDomain: 'example.com', expected: '403 without a signature' },
] as const;

interface Check {
  id: string;
  passed: boolean;
  expected: string;
  observed: string;
}

interface HttpExchange {
  httpStatus: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
}

function selectHeaders(headers: Headers, names: string[]) {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = headers.get(name);
      return value === null ? [] : [[name, value]];
    }),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readTxt(data: string) {
  if (!data.startsWith('"')) return data;
  const chunks = data.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  if (chunks.join(' ') !== data) throw new Error('Unexpected DNS TXT encoding');
  return chunks.map((chunk) => JSON.parse(chunk) as string).join('');
}

async function readPublicBody(fetcher: typeof fetch, url: string) {
  const response = await fetcher(url, {
    cache: 'no-store',
    // Workers support manual redirects. The status check below rejects them.
    redirect: 'manual',
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error(`Empty response fetching ${url}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) {
        await reader.cancel();
        throw new Error(`Response exceeded 1 MiB fetching ${url}`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function readProofRecord(fetcher: typeof fetch) {
  const body = await readPublicBody(fetcher, `https://dns.google/resolve?name=${dnsName}&type=TXT`);
  const { Status, Answer = [] } = JSON.parse(new TextDecoder().decode(body)) as {
    Status: number;
    Answer?: { type: number; name: string; data: string }[];
  };
  if (Status !== 0) throw new Error(`DNS lookup returned status ${Status}`);

  const records = Answer.flatMap(({ type, name, data }) => {
    if (type !== 16 || name.toLowerCase().replace(/\.$/, '') !== dnsName) return [];
    try {
      const record = parse(readTxt(data));
      return record.v === 'aid2' ? [record] : [];
    } catch {
      return [];
    }
  });
  const [record] = records;
  if (
    records.length !== 1 ||
    !record ||
    record.proto !== 'mcp' ||
    record.uri !== endpoint ||
    !record.pka
  ) {
    throw new Error(`Expected one aid2 record publishing an MCP proof key for ${endpoint}`);
  }
  return { uri: record.uri, key: record.pka };
}

async function checkProof(
  fetcher: typeof fetch,
  proofCase: (typeof proofCases)[number],
  key: string,
): Promise<Check & Partial<HttpExchange> & { verified: boolean; domainBound?: boolean }> {
  const { id, requestedDomain, expected } = proofCase;
  let exchange: HttpExchange | undefined;
  try {
    const { domainBound } = await performPKAHandshake(
      endpoint,
      key,
      undefined,
      requestedDomain,
      async (uri, init) => {
        const response = await fetcher(uri, {
          ...init,
          // Return any redirect to the verifier, which rejects 3xx responses.
          redirect: 'manual',
          cache: 'no-store',
          signal: AbortSignal.timeout(timeout),
        });
        exchange = {
          httpStatus: response.status,
          requestHeaders: selectHeaders(new Headers(init.headers), [
            'Accept-Signature',
            'AID-Domain',
            'Cache-Control',
          ]),
          responseHeaders: selectHeaders(response.headers, [
            'Signature',
            'Signature-Input',
            'Cache-Control',
          ]),
        };
        await response.body?.cancel();
        return response;
      },
    );
    return {
      ...exchange,
      id,
      expected,
      passed: id !== 'wrong-domain' && domainBound === (id === 'bound'),
      verified: true,
      domainBound,
      observed: domainBound ? 'Verified domain-bound proof' : 'Verified unbound proof',
    };
  } catch (error) {
    const refused =
      exchange?.httpStatus === 403 &&
      !('Signature' in exchange.responseHeaders) &&
      !('Signature-Input' in exchange.responseHeaders);
    return {
      ...exchange,
      id,
      expected,
      passed: id === 'wrong-domain' && refused,
      verified: false,
      observed: refused ? '403 without a signature' : errorMessage(error),
    };
  }
}

async function sha256(bytes: ArrayBuffer) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'sha256:' + Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function inspectCard(bytes: ArrayBuffer, expectedDigest: string, expectedEndpoint: string) {
  const actualDigest = await sha256(bytes);
  if (actualDigest !== expectedDigest) {
    return { observed: 'card-digest-mismatch', expectedDigest, actualDigest };
  }
  const { remotes } = JSON.parse(new TextDecoder().decode(bytes)) as {
    remotes?: ({ type?: string; url?: string } | null)[];
  };
  const cardEndpoints = (Array.isArray(remotes) ? remotes : []).flatMap((remote) =>
    remote?.type === 'streamable-http' && typeof remote.url === 'string' ? [remote.url] : [],
  );
  return {
    observed: cardEndpoints.includes(expectedEndpoint)
      ? 'card-endpoint-match'
      : 'endpoint-mismatch',
    expectedDigest,
    actualDigest,
    expectedEndpoint,
    cardEndpoints,
  };
}

async function checkLiveCard(fetcher: typeof fetch, record: ReturnType<typeof readProofRecord>) {
  const id = 'card-digest';
  const expected = 'Card digest matches ARD and its Streamable HTTP URL matches AID';
  try {
    const manifest = await readPublicBody(fetcher, manifestUrl);
    const { entries } = JSON.parse(new TextDecoder().decode(manifest)) as {
      entries: { identifier: string; type: string; url: string; digest?: string }[];
    };
    const [entry, duplicate] = entries.filter(({ identifier }) => identifier === cardIdentifier);
    if (
      !entry ||
      duplicate ||
      entry.type !== 'application/mcp-server-card+json' ||
      entry.url !== cardUrl ||
      !entry.digest ||
      !/^sha256:[0-9a-f]{64}$/.test(entry.digest)
    ) {
      throw new Error('Expected one ModelMarket MCP server card entry with a SHA-256 digest');
    }
    const card = await readPublicBody(fetcher, cardUrl);
    const { uri } = await record;
    const result = await inspectCard(card, entry.digest, uri);
    return { id, expected, passed: result.observed === 'card-endpoint-match', ...result };
  } catch (error) {
    return { id, expected, passed: false, observed: errorMessage(error) };
  }
}

function encodeFixtureCard(url: string) {
  return new TextEncoder().encode(JSON.stringify({ remotes: [{ type: 'streamable-http', url }] }));
}

async function runStaleFixtures() {
  const original = encodeFixtureCard(endpoint);
  const stale = encodeFixtureCard(endpoint + '-old');
  const [endpointMismatch, digestMismatch] = await Promise.all([
    inspectCard(stale.buffer, await sha256(stale.buffer), endpoint),
    inspectCard(stale.buffer, await sha256(original.buffer), endpoint),
  ]);
  return [
    {
      id: 'stale-endpoint',
      expected: 'endpoint-mismatch',
      passed: endpointMismatch.observed === 'endpoint-mismatch',
      ...endpointMismatch,
    },
    {
      id: 'stale-digest',
      expected: 'card-digest-mismatch',
      passed: digestMismatch.observed === 'card-digest-mismatch',
      ...digestMismatch,
    },
  ];
}

export async function runModelMarketInterop(fetcher: typeof fetch = globalThis.fetch) {
  const checkedAt = new Date().toISOString();
  const record = readProofRecord(fetcher);
  const [proofs, liveCard, fixtures] = await Promise.all([
    record
      .then(({ key }) =>
        Promise.all(proofCases.map((proofCase) => checkProof(fetcher, proofCase, key))),
      )
      .catch((error) =>
        proofCases.map(({ id, expected }) => ({
          id,
          expected,
          passed: false,
          verified: false,
          observed: errorMessage(error),
        })),
      ),
    checkLiveCard(fetcher, record),
    runStaleFixtures(),
  ]);
  const live = [...proofs, liveCard];
  return { checkedAt, endpoint, dnsName, cardUrl, live, fixtures };
}

export type ModelMarketInteropReport = Awaited<ReturnType<typeof runModelMarketInterop>>;

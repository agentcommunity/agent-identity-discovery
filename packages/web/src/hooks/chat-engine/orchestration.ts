import { LiveDatasource } from '@/lib/datasources/live-datasource';
import type { Datasource, ProtocolToken } from '@/lib/datasources/types';
import { MockDatasource } from '@/lib/datasources/mock-datasource';
import { toolManifests } from '@/lib/tool-manifest-data';
import type { ScenarioManifest } from '@/lib/tool-manifest-types';
import { isOk } from '@/lib/types/result';
import type { DiscoveryResult } from '@/hooks/use-discovery';
import type { EngineState, ChatLogMessage } from './types';
import { uniqueId } from './reducer';
import {
  buildAuthRetryResultSignal,
  buildAuthRetryRunningSignal,
  buildConnectionResultSignal,
  buildConnectionRunningSignal,
  buildDiscoveryResultSignal,
  buildDiscoveryRunningSignal,
  isAuthRequiredResult,
} from './signals';

interface EngineActions {
  addMessage: (msg: ChatLogMessage) => void;
  replaceMessage: (id: string, msg: ChatLogMessage) => void;
  sendAssistant: (content: string) => void;
  setStatus: (status: EngineState['status']) => void;
  setDiscovery: (result: DiscoveryResult) => void;
  setHandshake: (result: import('@/hooks/use-connection').HandshakeResult) => void;
}

function selectDatasource(domain: string, datasource: Datasource | undefined): Datasource {
  const scenario: ScenarioManifest | undefined = toolManifests[domain];
  return (
    datasource ?? (scenario && !scenario.live ? new MockDatasource(domain) : new LiveDatasource())
  );
}

const ALL_PROTOCOLS = new Set<ProtocolToken>([
  'mcp',
  'a2a',
  'openapi',
  'grpc',
  'graphql',
  'websocket',
  'local',
  'zeroconf',
  'ucp',
]);

const toProtocolToken = (value: string | undefined): ProtocolToken => {
  const lowered = String(value ?? 'mcp').toLowerCase();
  return ALL_PROTOCOLS.has(lowered as ProtocolToken) ? (lowered as ProtocolToken) : 'mcp';
};

const addSignal = (
  actions: EngineActions,
  signal: Omit<Extract<ChatLogMessage, { type: 'status_signal' }>, 'type' | 'id'>,
) => {
  const id = uniqueId();
  actions.addMessage({
    type: 'status_signal',
    id,
    ...signal,
  });
  return id;
};

const replaceSignal = (
  actions: EngineActions,
  id: string,
  signal: Omit<Extract<ChatLogMessage, { type: 'status_signal' }>, 'type' | 'id'>,
) => {
  actions.replaceMessage(id, {
    type: 'status_signal',
    id,
    ...signal,
  });
};

export async function processDomain(
  domain: string,
  datasource: Datasource | undefined,
  actions: EngineActions,
) {
  const scenario: ScenarioManifest | undefined = toolManifests[domain];
  const selectedDs = selectDatasource(domain, datasource);

  actions.sendAssistant(
    scenario?.narrative1
      ? scenario.narrative1.replace('{domain}', domain)
      : `Running AID discovery workflow for ${domain}.`,
  );

  // 1. Discovery phase
  actions.setStatus('discovering');
  const discoverySignalId = addSignal(actions, buildDiscoveryRunningSignal(domain));

  const discoveryRes = await selectedDs.discover(domain);
  actions.setDiscovery(discoveryRes);
  replaceSignal(actions, discoverySignalId, buildDiscoveryResultSignal(domain, discoveryRes));

  if (!isOk(discoveryRes)) {
    actions.setStatus('discovery_failed');
    return;
  }

  const discoveryData = discoveryRes.value;
  const proto = toProtocolToken(
    typeof discoveryData.record.proto === 'string' ? discoveryData.record.proto : undefined,
  );
  const uri = String(discoveryData.record.uri ?? '');
  const authHint =
    typeof discoveryData.record.auth === 'string' ? discoveryData.record.auth : undefined;

  // 2. Connection phase
  actions.setStatus('connecting');
  const connectionSignalId = addSignal(actions, buildConnectionRunningSignal(discoveryData));

  const handshakeRes = await selectedDs.handshake(uri, {
    proto,
    authHint,
  });
  actions.setHandshake(handshakeRes);
  replaceSignal(
    actions,
    connectionSignalId,
    buildConnectionResultSignal(discoveryData, handshakeRes),
  );

  if (isOk(handshakeRes)) {
    actions.setStatus('connected');
    return;
  }

  if (isAuthRequiredResult(handshakeRes)) {
    actions.setStatus('needs_auth');
    return;
  }

  actions.setStatus('failed');
}

export async function provideAuth(
  token: string,
  state: EngineState,
  datasource: Datasource | undefined,
  actions: EngineActions,
) {
  if (state.status !== 'needs_auth' || !state.discovery || !isOk(state.discovery)) return;
  if (!state.domain) return;

  const rec = state.discovery.value.record;
  const authUri = String(rec.uri ?? '');
  const authProto = toProtocolToken(typeof rec.proto === 'string' ? rec.proto : undefined);
  const authHint = typeof rec.auth === 'string' ? rec.auth : undefined;

  actions.setStatus('connecting');
  const authSignalId = addSignal(actions, buildAuthRetryRunningSignal());

  const selectedDs = selectDatasource(state.domain, datasource);

  const handshakeRes = await selectedDs.handshake(authUri, {
    authBearer: token,
    proto: authProto,
    authHint,
  });
  actions.setHandshake(handshakeRes);
  replaceSignal(
    actions,
    authSignalId,
    buildAuthRetryResultSignal(state.discovery.value, handshakeRes),
  );

  if (isOk(handshakeRes)) {
    actions.setStatus('connected');
    return;
  }

  if (isAuthRequiredResult(handshakeRes)) {
    actions.setStatus('needs_auth');
    return;
  }

  actions.setStatus('failed');
}

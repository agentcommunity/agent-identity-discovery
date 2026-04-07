import type { ProtocolHandler, ProtocolHandlerOptions, ProtocolResult, AgentCard } from '../types';

/**
 * A2A protocol handler - fetches and displays Agent Card
 */
export class A2AHandler implements ProtocolHandler {
  readonly token = 'a2a' as const;
  readonly canConnect = true;

  async handle(options: ProtocolHandlerOptions): Promise<ProtocolResult> {
    const { uri } = options;

    try {
      // Determine the agent card URL
      // Typically at /.well-known/agent.json relative to the base URI
      let cardUrl: string;
      try {
        const baseUrl = new URL(uri);
        cardUrl = new URL('/.well-known/agent.json', baseUrl).toString();
      } catch {
        // If URI parsing fails, try appending the well-known path
        cardUrl = uri.endsWith('/')
          ? uri + '.well-known/agent.json'
          : uri + '/.well-known/agent.json';
      }

      // Fetch the agent card
      const response = await fetch(cardUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            proto: this.token,
            error: `Agent card not found at ${cardUrl}`,
            guidance: {
              canConnect: false,
              title: 'A2A Agent Discovered',
              description:
                'This agent uses the Agent-to-Agent (A2A) protocol, but the agent card could not be found.',
              docsUrl: 'https://a2aprotocol.ai/',
              nextSteps: [
                'Check if the agent card exists at ' + cardUrl,
                'Verify the agent is running and accessible',
                'Use an A2A-compatible client to connect',
              ],
            },
          };
        }
        throw new Error(`Failed to fetch agent card: ${response.status} ${response.statusText}`);
      }

      const cardData = (await response.json()) as unknown;
      const agentCard = this.validateAgentCard(cardData);

      return {
        success: true,
        proto: this.token,
        agentCard,
        guidance: {
          canConnect: false,
          title: 'A2A Agent Discovered',
          description:
            agentCard.description || 'This agent uses the Agent-to-Agent (A2A) protocol.',
          docsUrl: 'https://a2aprotocol.ai/',
          nextSteps: [
            'Use an A2A-compatible client to connect',
            'Review the agent card for available skills and auth requirements',
            ...(agentCard.url ? [`Agent URL: ${agentCard.url}`] : []),
          ],
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        proto: this.token,
        error: `Failed to fetch A2A agent card: ${errorMessage}`,
        guidance: {
          canConnect: false,
          title: 'A2A Agent Discovered',
          description:
            'This agent uses the Agent-to-Agent (A2A) protocol. Connection testing requires an A2A-compatible client.',
          docsUrl: 'https://a2aprotocol.ai/',
          nextSteps: [
            'Use an A2A-compatible client to connect',
            'Fetch the agent card at ' + uri,
            'The agent card describes available skills and auth requirements',
          ],
        },
      };
    }
  }

  /**
   * Validate and normalize agent card data
   */
  private validateAgentCard(data: unknown): AgentCard {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid agent card: must be an object');
    }

    const card = data as Record<string, unknown>;

    if (typeof card.name !== 'string') {
      throw new TypeError('Invalid agent card: missing required field "name"');
    }

    if (typeof card.url !== 'string') {
      throw new TypeError('Invalid agent card: missing required field "url"');
    }

    const result: AgentCard = {
      name: card.name,
      url: card.url,
    };

    if (typeof card.description === 'string') {
      result.description = card.description;
    }

    if (card.provider && typeof card.provider === 'object') {
      const provider = card.provider as Record<string, unknown>;
      result.provider = {
        organization: typeof provider.organization === 'string' ? provider.organization : '',
        url: typeof provider.url === 'string' ? provider.url : undefined,
      };
    }

    if (Array.isArray(card.skills)) {
      const skills: Array<{ id: string; name: string; description?: string }> = [];
      for (const item of card.skills as unknown[]) {
        if (item && typeof item === 'object') {
          const skill = item as Record<string, unknown>;
          const id = typeof skill.id === 'string' ? skill.id : '';
          const name = typeof skill.name === 'string' ? skill.name : '';
          if (id && name) {
            skills.push({
              id,
              name,
              description: typeof skill.description === 'string' ? skill.description : undefined,
            });
          }
        }
      }
      result.skills = skills;
    }

    if (card.authentication && typeof card.authentication === 'object') {
      const auth = card.authentication as Record<string, unknown>;
      result.authentication = {
        schemes: Array.isArray(auth.schemes)
          ? auth.schemes.filter((s): s is string => typeof s === 'string')
          : [],
        credentials: typeof auth.credentials === 'string' ? auth.credentials : undefined,
      };
    }

    return result;
  }
}

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { UnknownPartyFilterError } from '../src/error';
import { makeServer } from '../src/server/index';

import type { AppEnv } from '../src/server/utils/hono';

async function createMcpApp(find: ReturnType<typeof vi.fn>) {
  const sys = {
    options: {
      site: 'animes.garden'
    },
    logger: {
      info: vi.fn(),
      error: vi.fn()
    },
    initialize: vi.fn(),
    modules: {
      resources: {
        query: {
          find
        }
      }
    }
  } as any;

  return (await makeServer(sys, {})).hono as Hono<AppEnv>;
}

/** Performs the MCP initialize handshake and returns the session id. */
async function initializeSession(app: Hono<AppEnv>) {
  const response = await app.request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '1.0.0' }
      }
    })
  });

  expect(response.status).toBe(200);
  const sessionId = response.headers.get('mcp-session-id');
  await response.text();

  await app.request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  });

  return sessionId;
}

async function callSearchResources(
  app: Hono<AppEnv>,
  sessionId: string | null,
  args: Record<string, unknown>
): Promise<any> {
  const response = await app.request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'mcp-session-id': sessionId } : {})
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_resources', arguments: args }
    })
  });

  expect(response.status).toBe(200);
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (contentType.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .at(-1);
    return JSON.parse(data!.slice('data:'.length).trim());
  }
  return JSON.parse(text);
}

describe('mcp server card', () => {
  it('redirects discovery to the web host', async () => {
    const app = await createMcpApp(vi.fn());

    const response = await app.request('http://localhost/.well-known/mcp/server-card.json');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://animes.garden/.well-known/mcp/server-card.json'
    );
  });
});

describe('mcp search_resources strict default', () => {
  function createFind() {
    return vi.fn(async (filter: any) => {
      // Mirrors QueryManager.find: strict mode fails on unknown party names.
      if (filter.strict === true && (filter.fansubs ?? []).includes('未知字幕组')) {
        throw new UnknownPartyFilterError({ fansubs: ['未知字幕组'], publishers: [] });
      }
      return {
        resources: [],
        pagination: { page: 1, pageSize: 30, complete: true },
        filter: {}
      };
    });
  }

  it('rejects unknown fansub names by default with a tool error', async () => {
    const find = createFind();
    const app = await createMcpApp(find);
    const sessionId = await initializeSession(app);

    const result = await callSearchResources(app, sessionId, { fansubs: ['未知字幕组'] });

    expect(result.error).toBeUndefined();
    expect(result.result.isError).toBe(true);
    expect(JSON.stringify(result.result.content)).toContain('Unknown fansubs: 未知字幕组');
    // The MCP handler injected the default strict mode into the filter.
    expect(find.mock.calls[0][0]).toMatchObject({ fansubs: ['未知字幕组'], strict: true });
  });

  it('keeps the lenient behavior with an explicit strict=false', async () => {
    const find = createFind();
    const app = await createMcpApp(find);
    const sessionId = await initializeSession(app);

    const result = await callSearchResources(app, sessionId, {
      fansubs: ['未知字幕组'],
      strict: false
    });

    expect(result.result.isError).toBeUndefined();
    expect(result.result.structuredContent).toMatchObject({ resources: [] });
    // An explicit false must not enable strict matching.
    expect(find.mock.calls[0][0]).toMatchObject({ fansubs: ['未知字幕组'] });
    expect(find.mock.calls[0][0]).not.toHaveProperty('strict');
  });

  it('succeeds with known fansub names under the default strict mode', async () => {
    const find = createFind();
    const app = await createMcpApp(find);
    const sessionId = await initializeSession(app);

    const result = await callSearchResources(app, sessionId, { fansubs: ['LMC'] });

    expect(result.result.isError).toBeUndefined();
    expect(result.result.structuredContent).toMatchObject({ resources: [] });
    expect(find.mock.calls[0][0]).toMatchObject({ fansubs: ['LMC'], strict: true });
  });
});

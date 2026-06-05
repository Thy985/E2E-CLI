import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { FigmaClient } from '../../src/integrations/figma/client';

describe('FigmaClient - typed API surface', () => {
  let originalFetch: typeof fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getFile returns a normalized FigmaFile shape (never null/undefined)', async () => {
    mockFetch = mock(async () =>
      new Response(JSON.stringify({ document: { id: '0:1', name: 'Doc', type: 'DOCUMENT' } }), {
        status: 200,
      })
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new FigmaClient('token-abc');
    const file = await client.getFile('file-123');

    expect(file.document.id).toBe('0:1');
    expect(file.document.type).toBe('DOCUMENT');
    expect(file.styles).toEqual({});
  });

  it('getFile fills in empty defaults when API response is minimal', async () => {
    mockFetch = mock(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new FigmaClient('token-abc');
    const file = await client.getFile('file-123');

    expect(file.document.id).toBe('root');
    expect(file.styles).toEqual({});
  });

  it('throws on 4xx/5xx from Figma API', async () => {
    mockFetch = mock(async () => new Response('unauthorized', { status: 401 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new FigmaClient('bad-token');
    await expect(client.getFile('file-123')).rejects.toThrow(/401/);
  });

  it('getComponents returns COMPONENT and COMPONENT_SET nodes only', async () => {
    const mockDoc = {
      id: '0:1',
      name: 'Doc',
      type: 'DOCUMENT',
      children: [
        { id: '1:1', name: 'Button', type: 'COMPONENT' },
        { id: '1:2', name: 'Card Set', type: 'COMPONENT_SET' },
        { id: '1:3', name: 'Group', type: 'GROUP' }, // not a component
        {
          id: '1:4',
          name: 'Frame',
          type: 'FRAME',
          children: [{ id: '1:5', name: 'Nested', type: 'COMPONENT' }],
        },
      ],
    };
    mockFetch = mock(async () => new Response(JSON.stringify({ document: mockDoc }), { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new FigmaClient('token-abc');
    const components = await client.getComponents('file-123');

    const ids: string[] = components.map((c: { id: string }) => c.id);
    expect(ids).toContain('1:1');
    expect(ids).toContain('1:2');
    expect(ids).toContain('1:5');
    expect(ids).not.toContain('1:3');
  });

  it('getComponents handles cycles safely (Figma mock data might loop)', async () => {
    // JSON.stringify cannot serialize cyclic structures, so we test dedup
    // with a node that appears in two children branches.
    const sharedLeaf: { id: string; name: string; type: string; children?: unknown[] } = {
      id: '1:5',
      name: 'Shared',
      type: 'COMPONENT',
    };
    const mockDoc = {
      id: '0:1',
      name: 'Doc',
      type: 'DOCUMENT',
      children: [
        { id: '1:1', name: 'Branch A', type: 'FRAME', children: [sharedLeaf] },
        { id: '1:2', name: 'Branch B', type: 'FRAME', children: [sharedLeaf] },
      ],
    };
    mockFetch = mock(async () => new Response(JSON.stringify({ document: mockDoc }), { status: 200 }));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new FigmaClient('token-abc');
    const components = await client.getComponents('file-123');
    // The same COMPONENT referenced by two branches should still appear once.
    expect(components.filter((c: { id: string }) => c.id === '1:5')).toHaveLength(1);
  });

  it('extractDesignTokens degrades gracefully when Figma variables API is unavailable', async () => {
    let callCount = 0;
    mockFetch = mock(async (url: any) => {
      callCount++;
      if (String(url).includes('/variables/local')) {
        return new Response('not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({ document: { id: '0:1', name: 'Doc', type: 'DOCUMENT' }, styles: {} }),
        { status: 200 }
      );
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const client = new FigmaClient('token-abc');
    const tokens = await client.extractDesignTokens('file-123');

    expect(tokens).toBeDefined();
    expect(tokens.colors).toEqual({});
    expect(callCount).toBeGreaterThan(0);
  });
});

import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { registerJovieWebMcpTools } from '@/lib/agent-ready/web-mcp';
import { WebMcpTools } from './WebMcpTools';

type ModelContext = Parameters<typeof registerJovieWebMcpTools>[0];

const originalDocumentContext = Object.getOwnPropertyDescriptor(
  document,
  'modelContext'
);
const originalNavigatorContext = Object.getOwnPropertyDescriptor(
  navigator,
  'modelContext'
);

function setContext(target: Document | Navigator, context: unknown) {
  Object.defineProperty(target, 'modelContext', {
    configurable: true,
    value: context,
  });
}

function restoreContext(
  target: Document | Navigator,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) Object.defineProperty(target, 'modelContext', descriptor);
  else Reflect.deleteProperty(target, 'modelContext');
}

function createContext() {
  return { registerTool: vi.fn<ModelContext['registerTool']>() };
}

beforeEach(() => {
  setContext(document, undefined);
  setContext(navigator, undefined);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  restoreContext(document, originalDocumentContext);
  restoreContext(navigator, originalNavigatorContext);
  vi.unstubAllGlobals();
});

describe('WebMcpTools', () => {
  it('renders no UI and makes no request when WebMCP is unavailable', () => {
    const { container } = render(<WebMcpTools />);

    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('registers the read-only tool on document before navigator', () => {
    const documentContext = createContext();
    const navigatorContext = createContext();
    setContext(document, documentContext);
    setContext(navigator, navigatorContext);

    const { container, rerender } = render(<WebMcpTools />);
    rerender(<WebMcpTools />);

    expect(container).toBeEmptyDOMElement();
    expect(documentContext.registerTool).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: 'get_public_creator_profile',
        annotations: { readOnlyHint: true },
      }),
      { signal: expect.any(AbortSignal) }
    );
    expect(navigatorContext.registerTool).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to navigator when document has no model context', () => {
    const context = createContext();
    setContext(navigator, context);

    render(<WebMcpTools />);

    expect(context.registerTool).toHaveBeenCalledTimes(1);
  });

  it('ignores a model context without a callable registerTool', () => {
    setContext(document, { registerTool: true });

    const { container } = render(<WebMcpTools />);

    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('executes the mounted tool through the anonymous profile API', async () => {
    const context = createContext();
    setContext(document, context);
    const fetchProfile = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetchProfile);

    render(<WebMcpTools />);
    const tool = context.registerTool.mock.calls[0]?.[0];
    if (!tool) throw new Error('WebMCP tool was not registered');

    expect(await tool.execute({ username: 'tim' })).toEqual({
      content: [{ type: 'text', text: '{"ok":true}' }],
    });
    expect(fetchProfile).toHaveBeenCalledExactlyOnceWith('/api/v1/tim', {
      headers: { accept: 'application/json' },
      credentials: 'omit',
    });
  });

  it('aborts the registration when the homepage unmounts', () => {
    const context = createContext();
    setContext(document, context);
    const { unmount } = render(<WebMcpTools />);
    const signal = context.registerTool.mock.calls[0]?.[1]?.signal;

    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('uses a fresh registration signal during Strict Mode remounts', () => {
    const context = createContext();
    setContext(document, context);
    const { unmount } = render(
      <StrictMode>
        <WebMcpTools />
      </StrictMode>
    );
    const signals = context.registerTool.mock.calls.map(
      ([, options]) => options?.signal
    );

    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    unmount();
    expect(signals.every(signal => signal?.aborted)).toBe(true);
  });

  it('keeps the page mounted when registration throws', () => {
    const context = createContext();
    context.registerTool.mockImplementation(() => {
      throw new Error('WebMCP registration unavailable');
    });
    setContext(document, context);

    const { container } = render(<WebMcpTools />);

    expect(context.registerTool).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('handles an asynchronous registration rejection without breaking the page', async () => {
    const context = createContext();
    context.registerTool.mockRejectedValue(new Error('WebMCP unavailable'));
    setContext(document, context);

    await act(async () => {
      render(<WebMcpTools />);
    });

    expect(context.registerTool).toHaveBeenCalledTimes(1);
  });
});

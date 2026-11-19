import { beforeEach, describe, expect, it, vi } from 'vitest';

const { boardMock } = vi.hoisted(() => ({ boardMock: vi.fn() }));

vi.mock('@vercel/board', () => ({ board: boardMock }));

describe('mesh board audit watcher route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = 'production';
  });

  it('registers a mesh_tasks_audit watcher on mesh/tasks and only logs', async () => {
    vi.resetModules();
    const logged: string[] = [];
    boardMock.mockImplementation(
      (options: {
        watch: Record<
          string,
          { tail: string; run: (context: { event: unknown }) => unknown }
        >;
      }) => {
        const watcher = options.watch.mesh_tasks_audit;
        // Exercise the run the way a wake would: it must log, never write.
        const consoleSpy = vi
          .spyOn(console, 'log')
          .mockImplementation((line: string) => {
            logged.push(line);
          });
        watcher.run({
          event: {
            type: 'task.created',
            cursor: 'c1',
            createdAt: '2026-11-19T16:00:00.000Z',
            message: { id: 'msg_1', labels: { hub_stage: '3', hub_at: '1' } },
          },
        });
        consoleSpy.mockRestore();
        return {
          fetch: async (request: Request) =>
            new Response(`mounted:${new URL(request.url).pathname}`, {
              status: 200,
            }),
        };
      }
    );
    const { GET, POST } = await import('./route');
    expect(boardMock).toHaveBeenCalledTimes(1);
    const response = await GET(
      new Request('https://jov.ie/api/internal/mesh-board')
    );
    expect(response.status).toBe(200);
    expect(
      await POST(
        new Request('https://jov.ie/api/internal/mesh-board', {
          method: 'POST',
        })
      )
    ).toBeTruthy();
    expect(logged).toHaveLength(1);
    const parsed = JSON.parse(logged[0]) as Record<string, unknown>;
    expect(parsed.evt).toBe('board_pilot');
    expect(parsed.hubStage).toBe('3');
    expect(parsed.wakeAt).toBeTypeOf('number');
  });

  it('404s outside production without registering writes', async () => {
    vi.resetModules();
    boardMock.mockImplementation(() => ({
      fetch: async () => new Response('mounted', { status: 200 }),
    }));
    process.env.VERCEL_ENV = 'preview';
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://jov.ie/api/internal/mesh-board')
    );
    expect(response.status).toBe(404);
  });
});

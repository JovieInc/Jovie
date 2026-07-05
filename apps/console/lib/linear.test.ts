import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTasteInbox } from './linear';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('fetchTasteInbox', () => {
  it('returns unavailable when no API key is provided', async () => {
    const result = await fetchTasteInbox(undefined);
    expect(result.available).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.error).toMatch(/LINEAR_API_KEY/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns issues split by label when API responds successfully', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({
        data: {
          issues: {
            nodes: [
              {
                id: 'issue-1',
                identifier: 'JOV-100',
                title: 'Pick a color for the hero',
                url: 'https://linear.app/jovie/issue/JOV-100',
                priority: 2,
                priorityLabel: 'High',
                createdAt: '2026-06-10T12:00:00Z',
                description: 'Design judgment needed — is the purple right?',
                labels: { nodes: [{ id: 'lbl-1', name: 'needs:taste' }] },
              },
              {
                id: 'issue-2',
                identifier: 'JOV-101',
                title: 'Sign the ASC agreement',
                url: 'https://linear.app/jovie/issue/JOV-101',
                priority: 1,
                priorityLabel: 'Urgent',
                createdAt: '2026-06-11T09:00:00Z',
                description: 'Requires a physical action from Tim.',
                labels: { nodes: [{ id: 'lbl-2', name: 'needs:human' }] },
              },
            ],
          },
        },
      })
    );

    const result = await fetchTasteInbox('test-key');

    expect(result.available).toBe(true);
    expect(result.issues).toHaveLength(2);

    const tasteIssue = result.issues.find(i => i.label === 'needs:taste');
    expect(tasteIssue?.identifier).toBe('JOV-100');
    expect(tasteIssue?.blockingReason).toContain('purple');

    const humanIssue = result.issues.find(i => i.label === 'needs:human');
    expect(humanIssue?.identifier).toBe('JOV-101');
    expect(humanIssue?.label).toBe('needs:human');
  });

  it('filters out issues that carry no recognised label', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({
        data: {
          issues: {
            nodes: [
              {
                id: 'issue-3',
                identifier: 'JOV-200',
                title: 'Some unrelated issue',
                url: 'https://linear.app/jovie/issue/JOV-200',
                priority: 4,
                priorityLabel: 'Low',
                createdAt: '2026-06-01T00:00:00Z',
                description: null,
                labels: { nodes: [{ id: 'lbl-x', name: 'bug' }] },
              },
            ],
          },
        },
      })
    );

    const result = await fetchTasteInbox('test-key');
    expect(result.available).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns unavailable on a non-ok HTTP response', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, false, 401));
    const result = await fetchTasteInbox('bad-key');
    expect(result.available).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns unavailable when Linear returns GraphQL errors', async () => {
    mockFetch.mockResolvedValue(
      makeResponse({ errors: [{ message: 'Unauthenticated' }] })
    );
    const result = await fetchTasteInbox('test-key');
    expect(result.available).toBe(false);
    expect(result.error).toContain('Unauthenticated');
  });

  it('returns unavailable on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'));
    const result = await fetchTasteInbox('test-key');
    expect(result.available).toBe(false);
    expect(result.error).toContain('connection refused');
  });
});

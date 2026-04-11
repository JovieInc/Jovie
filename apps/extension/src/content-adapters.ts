export interface AdapterTarget {
  readonly selector: string;
  readonly label: string;
  readonly inputTypes?: readonly string[];
  readonly allowContentEditable?: boolean;
}

export interface PageAdapter {
  readonly id: string;
  readonly hosts: readonly string[];
  readonly targets: readonly AdapterTarget[];
}

export interface AdapterPreviewResponse {
  readonly ok: true;
  readonly adapterId: string;
  readonly targetLabel: string;
}

export interface AdapterErrorResponse {
  readonly ok: false;
  readonly adapterId?: string;
  readonly error: string;
}

export type AdapterResponse = AdapterPreviewResponse | AdapterErrorResponse;

export const ADAPTERS: readonly PageAdapter[] = [
  {
    id: 'gmail-compose',
    hosts: ['mail.google.com'],
    targets: [
      {
        selector: 'div[role="textbox"][g_editable="true"]',
        label: 'Gmail Compose Body',
        allowContentEditable: true,
      },
    ],
  },
  {
    id: 'genius-lyrics',
    hosts: ['genius.com'],
    targets: [
      {
        selector: 'textarea',
        label: 'Lyrics Field',
      },
      {
        selector: 'div[contenteditable="true"]',
        label: 'Lyrics Editor',
        allowContentEditable: true,
      },
    ],
  },
  {
    id: 'event-form',
    hosts: ['eventbrite.com', 'bandsintown.com'],
    targets: [
      {
        selector: 'input[type="text"]',
        label: 'Text Field',
        inputTypes: ['text', 'search', 'url'],
      },
      {
        selector: 'textarea',
        label: 'Details Field',
      },
    ],
  },
  {
    id: 'awal-project',
    hosts: ['workstation.awal.com'],
    targets: [
      {
        selector: 'input[placeholder="Project name"]',
        label: 'Project Name',
        inputTypes: ['text'],
      },
      {
        selector: 'input[placeholder="Project code"]',
        label: 'Project Code',
        inputTypes: ['text'],
      },
      {
        selector: 'input[id^="react-select"]',
        label: 'Project Artist',
        inputTypes: ['text'],
      },
      {
        selector: 'textarea.ProjectDescriptionInput-textarea',
        label: 'Project Description',
      },
    ],
  },
  {
    id: 'kosign-work',
    hosts: ['app.kosignmusic.com'],
    targets: [
      {
        selector: 'input[name="workTitle"]',
        label: 'Song Title',
        inputTypes: ['text'],
      },
    ],
  },
] as const;

function normalizeHost(hostname: string) {
  return hostname.toLowerCase();
}

function matchesHost(hostname: string, adapterHost: string) {
  return hostname === adapterHost || hostname.endsWith(`.${adapterHost}`);
}

export function findAdapterForHost(hostname: string): PageAdapter | null {
  const normalizedHost = normalizeHost(hostname);

  for (const adapter of ADAPTERS) {
    if (adapter.hosts.some(host => matchesHost(normalizedHost, host))) {
      return adapter;
    }
  }

  return null;
}

export function getActiveEditableElement(doc: Document) {
  const activeElement = doc.activeElement;

  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement
  ) {
    return activeElement;
  }

  if (
    activeElement instanceof HTMLElement &&
    (activeElement.isContentEditable ||
      activeElement.getAttribute('contenteditable') === 'true')
  ) {
    return activeElement;
  }

  return null;
}

export function getMatchingTarget(
  adapter: PageAdapter,
  element: HTMLElement | HTMLInputElement | HTMLTextAreaElement | null
) {
  if (!element) return null;

  for (const target of adapter.targets) {
    if (!element.matches(target.selector)) {
      continue;
    }

    if (
      element instanceof HTMLInputElement &&
      target.inputTypes &&
      !target.inputTypes.includes(element.type)
    ) {
      continue;
    }

    if (
      element instanceof HTMLElement &&
      element.isContentEditable &&
      !target.allowContentEditable
    ) {
      continue;
    }

    return target;
  }

  return null;
}

export function buildPreviewResponse(
  hostname: string,
  doc: Document
): AdapterResponse {
  const adapter = findAdapterForHost(hostname);
  if (!adapter) {
    return {
      ok: false,
      error: 'No supported adapter is active on this page.',
    };
  }

  const targetElement = getActiveEditableElement(doc);
  const target = getMatchingTarget(adapter, targetElement);

  if (!target) {
    return {
      ok: false,
      adapterId: adapter.id,
      error: 'Focus a supported field before inserting.',
    };
  }

  return {
    ok: true,
    adapterId: adapter.id,
    targetLabel: target.label,
  };
}

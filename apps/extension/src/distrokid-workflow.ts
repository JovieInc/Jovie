import type {
  ExtensionAvailableTarget,
  ExtensionTargetKey,
  ExtensionWorkflowId,
} from '@jovie/extension-contracts';

type EditableElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

type TargetDefinition = {
  readonly targetKey: ExtensionTargetKey;
  readonly targetLabel: string;
  readonly selectors: readonly string[];
};

export interface WorkflowInventory {
  readonly workflowId: ExtensionWorkflowId;
  readonly pageVariant: string | null;
  readonly availableTargets: readonly ExtensionAvailableTarget[];
}

export interface WorkflowPreviewResponse {
  readonly ok: boolean;
  readonly workflowId?: ExtensionWorkflowId;
  readonly pageVariant?: string | null;
  readonly availableTargets?: readonly ExtensionAvailableTarget[];
  readonly error?: string;
}

const RELEASE_TARGETS: readonly TargetDefinition[] = [
  {
    targetKey: 'release_title',
    targetLabel: 'Release Title',
    selectors: [
      '[data-jovie-target="release_title"]',
      'input[name="album_title"]',
      '#album_title',
    ],
  },
  {
    targetKey: 'artist_name',
    targetLabel: 'Artist Name',
    selectors: [
      '[data-jovie-target="artist_name"]',
      'input[name="artist_name"]',
      '#artist_name',
    ],
  },
  {
    targetKey: 'release_date',
    targetLabel: 'Release Date',
    selectors: [
      '[data-jovie-target="release_date"]',
      'input[name="release_date"]',
      '#release_date',
    ],
  },
  {
    targetKey: 'upc',
    targetLabel: 'UPC',
    selectors: ['[data-jovie-target="upc"]', 'input[name="upc"]', '#upc'],
  },
  {
    targetKey: 'primary_genre',
    targetLabel: 'Primary Genre',
    selectors: [
      '[data-jovie-target="primary_genre"]',
      'select[name="primary_genre"]',
      '#primary_genre',
    ],
  },
  {
    targetKey: 'secondary_genre',
    targetLabel: 'Secondary Genre',
    selectors: [
      '[data-jovie-target="secondary_genre"]',
      'select[name="secondary_genre"]',
      '#secondary_genre',
    ],
  },
  {
    targetKey: 'label_name',
    targetLabel: 'Label Name',
    selectors: [
      '[data-jovie-target="label_name"]',
      'input[name="label_name"]',
      '#label_name',
    ],
  },
] as const;

const TRACK_TARGETS: readonly TargetDefinition[] = [
  {
    targetKey: 'track_title',
    targetLabel: 'Track Title',
    selectors: [
      '[data-jovie-target="track_title"]',
      'input[name*="track_title"]',
    ],
  },
  {
    targetKey: 'track_isrc',
    targetLabel: 'Track ISRC',
    selectors: [
      '[data-jovie-target="track_isrc"]',
      'input[name*="track_isrc"]',
      'input[name*="isrc"]',
    ],
  },
  {
    targetKey: 'explicit',
    targetLabel: 'Explicit',
    selectors: [
      '[data-jovie-target="explicit"]',
      'input[type="checkbox"][name*="explicit"]',
      'select[name*="explicit"]',
    ],
  },
  {
    targetKey: 'songwriter',
    targetLabel: 'Songwriter',
    selectors: ['[data-jovie-target="songwriter"]'],
  },
  {
    targetKey: 'producer',
    targetLabel: 'Producer',
    selectors: ['[data-jovie-target="producer"]'],
  },
  {
    targetKey: 'youtube_music_id',
    targetLabel: 'YouTube Music Id',
    selectors: ['[data-jovie-target="youtube_music_id"]'],
  },
] as const;

const TRACK_ROW_SELECTORS = [
  '[data-jovie-track-row]',
  '[data-track-row]',
  '.track-row',
  '.songRow',
] as const;

function matchesHost(hostname: string, adapterHost: string) {
  const normalizedHost = hostname.toLowerCase();
  return (
    normalizedHost === adapterHost || normalizedHost.endsWith(`.${adapterHost}`)
  );
}

function findFirstElement(root: ParentNode, selectors: readonly string[]) {
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (
      match instanceof HTMLInputElement ||
      match instanceof HTMLTextAreaElement ||
      match instanceof HTMLSelectElement
    ) {
      return match as EditableElement;
    }
  }
  return null;
}

function getTrackRows(doc: Document) {
  for (const selector of TRACK_ROW_SELECTORS) {
    const rows = Array.from(doc.querySelectorAll<HTMLElement>(selector));
    if (rows.length > 0) return rows;
  }
  return [];
}

export function hasSupportedWorkflow(hostname: string) {
  return matchesHost(hostname, 'distrokid.com');
}

export function inventoryWorkflow(doc: Document): WorkflowInventory {
  const availableTargets: ExtensionAvailableTarget[] = [];

  for (const target of RELEASE_TARGETS) {
    if (!findFirstElement(doc, target.selectors)) continue;
    availableTargets.push({
      targetId: target.targetKey,
      targetKey: target.targetKey,
      targetLabel: target.targetLabel,
      currentValue: null,
    });
  }

  getTrackRows(doc).forEach((row, groupIndex) => {
    for (const target of TRACK_TARGETS) {
      if (!findFirstElement(row, target.selectors)) continue;
      availableTargets.push({
        targetId: `${target.targetKey}:${groupIndex}`,
        targetKey: target.targetKey,
        targetLabel:
          target.targetKey === 'explicit'
            ? `Track ${groupIndex + 1} Explicit`
            : `Track ${groupIndex + 1} ${target.targetLabel}`,
        currentValue: null,
        groupIndex,
      });
    }
  });

  const targetKeys = new Set(availableTargets.map(target => target.targetKey));
  const hasMinimumFields =
    targetKeys.has('release_title') &&
    targetKeys.has('artist_name') &&
    targetKeys.has('release_date') &&
    targetKeys.has('primary_genre') &&
    targetKeys.has('track_title') &&
    targetKeys.has('explicit');

  return {
    workflowId: 'distrokid_release_form',
    pageVariant: hasMinimumFields ? 'release_form_v1' : null,
    availableTargets,
  };
}

export function buildWorkflowPreviewResponse(
  hostname: string,
  doc: Document
): WorkflowPreviewResponse {
  if (!hasSupportedWorkflow(hostname)) {
    return {
      ok: false,
      error: 'This page is not part of the DistroKid alpha.',
    };
  }

  const inventory = inventoryWorkflow(doc);
  if (inventory.availableTargets.length === 0) {
    return {
      ok: false,
      workflowId: inventory.workflowId,
      pageVariant: inventory.pageVariant,
      availableTargets: inventory.availableTargets,
      error: 'No supported DistroKid targets were found on this page.',
    };
  }

  return {
    ok: true,
    workflowId: inventory.workflowId,
    pageVariant: inventory.pageVariant,
    availableTargets: inventory.availableTargets,
  };
}

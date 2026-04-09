import type {
  ExtensionEntityField,
  ExtensionEntitySummary,
  ExtensionFlagsResponse,
  ExtensionPrimaryActionKind,
  ExtensionSummaryResponse,
} from '@jovie/extension-contracts';

declare const chrome: ChromeGlobal | undefined;

const JOVIE_ICON_PATH =
  'm176.84,0l3.08.05c8.92,1.73,16.9,6.45,23.05,13.18,7.95,8.7,12.87,20.77,12.87,34.14s-4.92,25.44-12.87,34.14c-6.7,7.34-15.59,12.28-25.49,13.57h-.64s0,.01,0,.01h0c-22.2,0-42.3,8.84-56.83,23.13-14.5,14.27-23.49,33.99-23.49,55.77h0v.02c0,21.78,8.98,41.5,23.49,55.77,14.54,14.3,34.64,23.15,56.83,23.15v-.02h.01c22.2,0,42.3-8.84,56.83-23.13,14.51-14.27,23.49-33.99,23.49-55.77h0c0-17.55-5.81-33.75-15.63-46.82-10.08-13.43-24.42-23.61-41.05-28.62l-2.11-.64c4.36-2.65,8.34-5.96,11.84-9.78,9.57-10.47,15.5-24.89,15.5-40.77s-5.93-30.3-15.5-40.77c-1.44-1.57-2.95-3.06-4.55-4.44l7.67,1.58c40.44,8.35,75.81,30.3,100.91,60.75,24.66,29.91,39.44,68.02,39.44,109.5h0c0,48.05-19.81,91.55-51.83,123.05-31.99,31.46-76.19,50.92-125,50.92v.02h-.01c-48.79,0-93-19.47-125-50.94C19.81,265.54,0,222.04,0,173.99h0c0-48.05,19.81-91.56,51.83-123.05C83.84,19.47,128.04,0,176.84,0Z';

const FLAGS_CACHE_KEY = 'extensionFlagsCache';

interface CachedSummary {
  readonly tabKey: string;
  readonly payload: ExtensionSummaryResponse;
  readonly cachedAt: number;
}

interface PendingInsert {
  readonly entityId: string;
  readonly fieldId: string;
  readonly targetLabel: string;
  readonly adapterId: string;
}

interface AppState {
  readonly flags: ExtensionFlagsResponse | null;
  readonly summary: ExtensionSummaryResponse | null;
  readonly currentTabId: number | null;
  readonly currentTabUrl: string | null;
  readonly currentTabTitle: string | null;
  readonly domainPermissionGranted: boolean;
  readonly selectedEntityId: string | null;
  readonly pendingInsert: PendingInsert | null;
  readonly statusMessage: string | null;
  readonly loading: boolean;
}

const rootElement = document.querySelector<HTMLDivElement>('#app');

if (!rootElement) {
  throw new Error('Missing app root.');
}

const root = rootElement;

let state: AppState = {
  flags: null,
  summary: null,
  currentTabId: null,
  currentTabUrl: null,
  currentTabTitle: null,
  domainPermissionGranted: false,
  selectedEntityId: null,
  pendingInsert: null,
  statusMessage: null,
  loading: true,
};

function setState(partial: Partial<AppState>) {
  state = {
    ...state,
    ...partial,
  };
  render();
}

function getSelectedEntity() {
  if (!state.summary) return null;

  return (
    state.summary.entities.find(
      entity => entity.id === state.selectedEntityId
    ) ?? state.summary.suggestion
  );
}

function getPendingField() {
  const entity = getSelectedEntity();
  if (!entity || !state.pendingInsert) return null;
  if (entity.id !== state.pendingInsert.entityId) return null;

  return (
    entity.fields.find(field => field.id === state.pendingInsert?.fieldId) ??
    null
  );
}

function createLogoMark(size = 28) {
  const wrapper = document.createElement('div');
  wrapper.className = 'logo-mark';
  wrapper.innerHTML = `<svg viewBox="0 0 353.68 347.97" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${JOVIE_ICON_PATH}"></path></svg>`;
  return wrapper;
}

function createButton(
  label: string,
  variant: 'primary' | 'secondary' | 'ghost',
  onClick: () => void
) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button button-${variant}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

async function resolveActiveTab() {
  const tabs =
    (await chrome?.tabs?.query({
      active: true,
      currentWindow: true,
    })) ?? [];

  return tabs[0] ?? null;
}

async function resolveApiBaseUrl(activeTabUrl: string | null) {
  const storage = await chrome?.storage?.local.get('apiBaseUrl');
  const storedValue =
    storage?.apiBaseUrl && typeof storage.apiBaseUrl === 'string'
      ? storage.apiBaseUrl
      : null;

  if (storedValue) return storedValue;

  if (activeTabUrl) {
    try {
      const url = new URL(activeTabUrl);
      if (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname.endsWith('.jov.ie')
      ) {
        return url.origin;
      }
    } catch {
      // Fall through to production default.
    }
  }

  return 'https://app.jov.ie';
}

async function fetchFlags(apiBaseUrl: string) {
  const response = await fetch(`${apiBaseUrl}/api/extension/flags`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Unable to load extension flags.');
  }

  return (await response.json()) as ExtensionFlagsResponse;
}

async function fetchSummary(
  apiBaseUrl: string,
  currentTab: { url: string | null; title: string | null }
) {
  if (!currentTab.url) return null;

  const url = new URL(`${apiBaseUrl}/api/extension/summary`);
  url.searchParams.set('url', currentTab.url);

  if (currentTab.title) {
    url.searchParams.set('title', currentTab.title);
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
  });

  if (response.status === 401) {
    return 'signed_out' as const;
  }

  if (!response.ok) {
    throw new Error('Unable to load extension context.');
  }

  return (await response.json()) as ExtensionSummaryResponse;
}

function getOptionalOriginsForUrl(tabUrl: string | null) {
  if (!tabUrl) return [];

  try {
    const url = new URL(tabUrl);
    const host = url.hostname.toLowerCase();

    if (host === 'distrokid.com' || host.endsWith('.distrokid.com')) {
      return ['https://distrokid.com/*', 'https://*.distrokid.com/*'];
    }
  } catch {
    return [];
  }

  return [];
}

async function hasDomainPermission(tabUrl: string | null) {
  const origins = getOptionalOriginsForUrl(tabUrl);
  if (origins.length === 0) return true;

  return (await chrome?.permissions?.contains({ origins })) ?? false;
}

async function requestDomainPermission(tabUrl: string | null) {
  const origins = getOptionalOriginsForUrl(tabUrl);
  if (origins.length === 0) return true;

  return (await chrome?.permissions?.request({ origins })) ?? false;
}

function getSummaryCacheKey(tabUrl: string | null) {
  return tabUrl ? `extensionSummaryCache:${tabUrl}` : null;
}

async function readCachedFlags() {
  const storage = await chrome?.storage?.local.get(FLAGS_CACHE_KEY);
  const cached = storage?.[FLAGS_CACHE_KEY];
  if (!cached || typeof cached !== 'object') return null;
  return cached as ExtensionFlagsResponse;
}

async function writeCachedFlags(flags: ExtensionFlagsResponse) {
  await chrome?.storage?.local.set({
    [FLAGS_CACHE_KEY]: flags,
  });
}

async function readCachedSummary(tabUrl: string | null) {
  const cacheKey = getSummaryCacheKey(tabUrl);
  if (!cacheKey) return null;

  const storage = await chrome?.storage?.local.get(cacheKey);
  const cached = storage?.[cacheKey];
  if (!cached || typeof cached !== 'object') return null;

  const parsed = cached as CachedSummary;
  if (parsed.tabKey !== cacheKey) return null;

  return parsed.payload;
}

async function writeCachedSummary(
  tabUrl: string | null,
  payload: ExtensionSummaryResponse
) {
  const cacheKey = getSummaryCacheKey(tabUrl);
  if (!cacheKey) return;

  const value: CachedSummary = {
    tabKey: cacheKey,
    payload,
    cachedAt: Date.now(),
  };

  await chrome?.storage?.local.set({
    [cacheKey]: value,
  });
}

async function logAction(
  apiBaseUrl: string,
  payload: {
    action: ExtensionPrimaryActionKind;
    entity: ExtensionEntitySummary;
    fieldId?: string;
    pageUrl: string | null;
    pageTitle: string | null;
    result: 'pending' | 'succeeded' | 'failed';
  }
) {
  if (!payload.pageUrl) {
    throw new Error('Missing page URL for the action log.');
  }

  const response = await fetch(`${apiBaseUrl}/api/extension/action-log`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: payload.action,
      entityId: payload.entity.id,
      entityKind: payload.entity.kind,
      fieldId: payload.fieldId,
      pageUrl: payload.pageUrl,
      pageTitle: payload.pageTitle,
      result: payload.result,
    }),
  });

  if (!response.ok) {
    throw new Error('Unable to persist the action log.');
  }
}

async function copyValue(label: string, value: string) {
  await navigator.clipboard.writeText(value);
  setState({ statusMessage: `${label} copied.` });
}

async function insertValue(currentTabId: number, field: ExtensionEntityField) {
  const response = await chrome?.tabs?.sendMessage(currentTabId, {
    type: 'jovie:insert-text',
    value: field.value,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Unable to insert into the page.');
  }
}

async function getInsertPreview(currentTabId: number) {
  const response = await chrome?.tabs?.sendMessage(currentTabId, {
    type: 'jovie:get-insert-preview',
  });

  if (
    !response ||
    typeof response !== 'object' ||
    !('ok' in response) ||
    !response.ok
  ) {
    throw new Error(
      response && typeof response === 'object' && 'error' in response
        ? String(response.error)
        : 'Unable to build an insert preview for this page.'
    );
  }

  return {
    adapterId:
      'adapterId' in response && typeof response.adapterId === 'string'
        ? response.adapterId
        : 'unknown',
    targetLabel:
      'targetLabel' in response && typeof response.targetLabel === 'string'
        ? response.targetLabel
        : 'Supported Field',
  };
}

function createCardImage(imageUrl: string | null, title: string) {
  const image = document.createElement('div');
  image.className = 'entity-image';

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = title;
    img.loading = 'lazy';
    image.appendChild(img);
    return image;
  }

  image.appendChild(createLogoMark(20));
  return image;
}

function renderShell(children: HTMLElement[]) {
  root.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'shell';

  const header = document.createElement('header');
  header.className = 'top-rail';
  header.appendChild(createLogoMark());

  const railCopy = document.createElement('div');
  railCopy.className = 'top-rail-copy';

  const heading = document.createElement('p');
  heading.className = 'eyebrow';
  heading.textContent = 'Jovie';

  const status = document.createElement('h1');
  status.className = 'rail-title';
  status.textContent =
    state.summary?.context.statusLabel ??
    (state.flags?.signedIn ? 'Extension' : 'Sign In Required');

  railCopy.append(heading, status);
  header.appendChild(railCopy);
  shell.appendChild(header);

  const main = document.createElement('main');
  main.className = 'panel-scroll';
  for (const child of children) {
    main.appendChild(child);
  }

  shell.appendChild(main);
  const promptDock = renderPromptDock();
  if (promptDock) {
    shell.appendChild(promptDock);
  }
  root.appendChild(shell);
}

function renderLoading() {
  const section = document.createElement('section');
  section.className = 'section stack-md';

  for (let index = 0; index < 4; index += 1) {
    const skeleton = document.createElement('div');
    skeleton.className = 'card skeleton-card';
    section.appendChild(skeleton);
  }

  renderShell([section]);
}

function renderSignedOut() {
  const section = document.createElement('section');
  section.className = 'signed-out';

  const center = document.createElement('div');
  center.className = 'empty-hero';
  center.appendChild(createLogoMark(44));

  const title = document.createElement('h2');
  title.className = 'empty-title';
  title.textContent = 'Bring Jovie Into This Page';

  const body = document.createElement('p');
  body.className = 'empty-body';
  body.textContent =
    'Sign in to load your artist context, releases, and one-click insert actions.';

  center.append(title, body);
  section.appendChild(center);

  const footer = document.createElement('div');
  footer.className = 'signed-out-actions';
  footer.append(
    createButton('Sign Up', 'secondary', () => {
      window.open('https://app.jov.ie/sign-up', '_blank');
    }),
    createButton('Log In', 'primary', () => {
      window.open('https://app.jov.ie/sign-in', '_blank');
    })
  );

  renderShell([section, footer]);
}

function renderEmptyState(titleText: string, bodyText: string) {
  const section = document.createElement('section');
  section.className = 'section';

  const hero = document.createElement('div');
  hero.className = 'empty-hero';
  hero.appendChild(createLogoMark(36));

  const title = document.createElement('h2');
  title.className = 'empty-title';
  title.textContent = titleText;

  const body = document.createElement('p');
  body.className = 'empty-body';
  body.textContent = bodyText;

  hero.append(title, body);
  section.appendChild(hero);
  renderShell([section]);
}

function renderSummaryCard(summary: ExtensionSummaryResponse) {
  const card = document.createElement('section');
  card.className = 'card stack-sm';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Suggested For This Page';

  const title = document.createElement('h2');
  title.className = 'section-title';
  title.textContent = summary.shellCopy.title;

  const body = document.createElement('p');
  body.className = 'section-body';
  body.textContent = summary.shellCopy.body;

  card.append(eyebrow, title, body);
  return card;
}

function renderCandidateCard(entity: ExtensionEntitySummary) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `entity-card${entity.id === state.selectedEntityId ? ' entity-card-active' : ''}`;
  button.addEventListener('click', () => {
    setState({
      selectedEntityId: entity.id,
      pendingInsert: null,
      statusMessage: null,
    });
  });

  const left = document.createElement('div');
  left.className = 'entity-card-left';
  left.appendChild(createCardImage(entity.imageUrl, entity.title));

  const copy = document.createElement('div');
  copy.className = 'entity-card-copy';

  const title = document.createElement('p');
  title.className = 'entity-card-title';
  title.textContent = entity.title;

  const subtitle = document.createElement('p');
  subtitle.className = 'entity-card-meta';
  subtitle.textContent =
    entity.metadataLine ?? entity.subtitle ?? 'Jovie entity';

  copy.append(title, subtitle);
  left.appendChild(copy);

  const action = document.createElement('span');
  action.className = 'entity-card-action';
  action.textContent = entity.primaryAction.label;

  button.append(left, action);
  return button;
}

function startInsertPreview(
  entity: ExtensionEntitySummary,
  field: ExtensionEntityField,
  preview: { targetLabel: string; adapterId: string }
) {
  setState({
    pendingInsert: {
      entityId: entity.id,
      fieldId: field.id,
      targetLabel: preview.targetLabel,
      adapterId: preview.adapterId,
    },
    statusMessage: null,
  });
}

function renderEntityDetail(entity: ExtensionEntitySummary) {
  const section = document.createElement('section');
  section.className = 'card stack-md';
  const canInsert =
    getMatchingDomainMode(state.flags, state.summary?.context.host ?? '') ===
    'write';

  const header = document.createElement('div');
  header.className = 'entity-detail-header';
  header.appendChild(createCardImage(entity.imageUrl, entity.title));

  const headerCopy = document.createElement('div');
  headerCopy.className = 'stack-xs';

  const title = document.createElement('h3');
  title.className = 'entity-detail-title';
  title.textContent = entity.title;

  const subtitle = document.createElement('p');
  subtitle.className = 'entity-card-meta';
  subtitle.textContent =
    entity.subtitle ?? entity.metadataLine ?? 'Selected Entity';
  headerCopy.append(title, subtitle);
  header.appendChild(headerCopy);
  section.appendChild(header);

  const fields = document.createElement('div');
  fields.className = 'field-list';

  for (const field of entity.fields) {
    const row = document.createElement('div');
    row.className = 'field-row';

    const copyBlock = document.createElement('div');
    copyBlock.className = 'field-copy';

    const label = document.createElement('p');
    label.className = 'field-label';
    label.textContent = field.label;

    const value = document.createElement('p');
    value.className = 'field-value';
    value.textContent = field.value;

    copyBlock.append(label, value);
    row.appendChild(copyBlock);

    const actions = document.createElement('div');
    actions.className = 'field-actions';

    actions.appendChild(
      createButton('Copy', 'ghost', async () => {
        await copyValue(field.label, field.value);
      })
    );

    if (canInsert) {
      actions.appendChild(
        createButton('Insert', 'ghost', async () => {
          if (state.currentTabId === null) {
            setState({ statusMessage: 'No active tab available.' });
            return;
          }

          try {
            const preview = await getInsertPreview(state.currentTabId);
            startInsertPreview(entity, field, preview);
          } catch (error) {
            setState({
              statusMessage:
                error instanceof Error
                  ? error.message
                  : 'Unable to build an insert preview.',
            });
          }
        })
      );
    }

    row.appendChild(actions);
    fields.appendChild(row);
  }

  section.appendChild(fields);
  return section;
}

function renderDiscovery(summary: ExtensionSummaryResponse) {
  if (summary.discoverySuggestions.length === 0) return null;

  const section = document.createElement('section');
  section.className = 'stack-sm';

  const title = document.createElement('p');
  title.className = 'eyebrow';
  title.textContent = 'Suggestions';
  section.appendChild(title);

  for (const suggestion of summary.discoverySuggestions) {
    const card = document.createElement('div');
    card.className = 'card stack-sm discovery-card';

    const heading = document.createElement('h3');
    heading.className = 'section-title';
    heading.textContent = suggestion.title;

    const body = document.createElement('p');
    body.className = 'section-body';
    body.textContent = suggestion.body;

    const action = document.createElement('p');
    action.className = 'discovery-action';
    action.textContent = suggestion.actionLabel;

    card.append(heading, body, action);
    section.appendChild(card);
  }

  return section;
}

function renderPreviewCard(
  entity: ExtensionEntitySummary,
  field: ExtensionEntityField
) {
  const card = document.createElement('section');
  card.className = 'card stack-sm preview-card';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Preview';

  const title = document.createElement('h3');
  title.className = 'section-title';
  title.textContent = `Insert ${field.label}`;

  const body = document.createElement('p');
  body.className = 'section-body';
  body.textContent = `Jovie will insert this value from ${entity.title} into ${state.pendingInsert?.targetLabel ?? 'the approved field'} using the ${state.pendingInsert?.adapterId ?? 'active'} adapter.`;

  const diff = document.createElement('div');
  diff.className = 'preview-diff';

  const diffLabel = document.createElement('p');
  diffLabel.className = 'field-label';
  diffLabel.textContent = field.label;

  const diffValue = document.createElement('p');
  diffValue.className = 'preview-value';
  diffValue.textContent = field.value;

  diff.append(diffLabel, diffValue);
  card.append(eyebrow, title, body, diff);
  return card;
}

function renderPermissionCard(host: string) {
  const card = document.createElement('section');
  card.className = 'card stack-sm permission-card';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Enable This Domain';

  const title = document.createElement('h3');
  title.className = 'section-title';
  title.textContent = `Enable Jovie On ${host}`;

  const body = document.createElement('p');
  body.className = 'section-body';
  body.textContent =
    'Grant access for this domain so Jovie can safely read the page and show release metadata for this workflow.';

  const actions = document.createElement('div');
  actions.className = 'permission-actions';
  actions.appendChild(
    createButton('Enable Domain', 'primary', async () => {
      const granted = await requestDomainPermission(state.currentTabUrl);
      setState({
        domainPermissionGranted: granted,
        statusMessage: granted
          ? `${host} enabled.`
          : 'Permission request was declined.',
      });
    })
  );

  card.append(eyebrow, title, body, actions);
  return card;
}

function renderPromptDock() {
  if (!state.statusMessage && !state.flags?.chatPromptEnabled) {
    return null;
  }

  const dock = document.createElement('div');
  dock.className = 'prompt-dock';

  if (state.statusMessage) {
    const status = document.createElement('p');
    status.className = 'status-message';
    status.textContent = state.statusMessage;
    dock.appendChild(status);
  }

  if (state.flags?.chatPromptEnabled) {
    const prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.className = 'prompt-button';
    prompt.textContent = 'Ask Jovie about this page';
    prompt.addEventListener('click', () => {
      setState({
        statusMessage:
          'Chat expansion is the next layer. The prompt dock is already wired into the shell.',
      });
    });

    dock.appendChild(prompt);
  }

  return dock;
}

async function confirmInsert(
  apiBaseUrl: string,
  currentTabId: number,
  currentTab: { url: string | null; title: string | null },
  entity: ExtensionEntitySummary,
  field: ExtensionEntityField
) {
  await logAction(apiBaseUrl, {
    action: 'insert',
    entity,
    fieldId: field.id,
    pageUrl: currentTab.url,
    pageTitle: currentTab.title,
    result: 'pending',
  });

  try {
    await insertValue(currentTabId, field);
    await logAction(apiBaseUrl, {
      action: 'insert',
      entity,
      fieldId: field.id,
      pageUrl: currentTab.url,
      pageTitle: currentTab.title,
      result: 'succeeded',
    });
    setState({
      pendingInsert: null,
      statusMessage: `${field.label} inserted.`,
    });
  } catch (error) {
    try {
      await logAction(apiBaseUrl, {
        action: 'insert',
        entity,
        fieldId: field.id,
        pageUrl: currentTab.url,
        pageTitle: currentTab.title,
        result: 'failed',
      });
    } catch {
      // Preserve the original failure message below.
    }

    setState({
      pendingInsert: null,
      statusMessage: error instanceof Error ? error.message : 'Insert failed.',
    });
  }
}

function getMatchingDomainMode(
  flags: ExtensionFlagsResponse | null,
  host: string
) {
  return (
    flags?.domains.find(
      domain => host === domain.host || host.endsWith(`.${domain.host}`)
    )?.mode ?? 'off'
  );
}

async function load() {
  setState({ loading: true, statusMessage: null });

  try {
    const tab = await resolveActiveTab();
    const currentTab = {
      url: tab?.url ?? null,
      title: tab?.title ?? null,
    };
    const apiBaseUrl = await resolveApiBaseUrl(currentTab.url);
    const domainPermissionGranted = await hasDomainPermission(currentTab.url);

    const [cachedFlags, cachedSummary] = await Promise.all([
      readCachedFlags(),
      readCachedSummary(currentTab.url),
    ]);

    if (cachedFlags) {
      setState({
        flags: cachedFlags,
        summary: cachedSummary,
        currentTabId: tab?.id ?? null,
        currentTabUrl: currentTab.url,
        currentTabTitle: currentTab.title,
        domainPermissionGranted,
        selectedEntityId:
          cachedSummary?.suggestion?.id ??
          cachedSummary?.entities[0]?.id ??
          null,
        loading: false,
      });
    }

    const flags = await fetchFlags(apiBaseUrl);
    await writeCachedFlags(flags);

    if (!flags.signedIn) {
      setState({
        flags,
        summary: null,
        currentTabId: tab?.id ?? null,
        currentTabUrl: currentTab.url,
        currentTabTitle: currentTab.title,
        domainPermissionGranted,
        selectedEntityId: null,
        pendingInsert: null,
        loading: false,
      });
      return;
    }

    const summaryResult = await fetchSummary(apiBaseUrl, currentTab);

    if (summaryResult === 'signed_out') {
      setState({
        flags,
        summary: null,
        currentTabId: tab?.id ?? null,
        currentTabUrl: currentTab.url,
        currentTabTitle: currentTab.title,
        domainPermissionGranted,
        selectedEntityId: null,
        pendingInsert: null,
        loading: false,
      });
      return;
    }

    if (summaryResult) {
      await writeCachedSummary(currentTab.url, summaryResult);
    }

    setState({
      flags,
      summary: summaryResult,
      currentTabId: tab?.id ?? null,
      currentTabUrl: currentTab.url,
      currentTabTitle: currentTab.title,
      domainPermissionGranted,
      selectedEntityId:
        summaryResult?.suggestion?.id ?? summaryResult?.entities[0]?.id ?? null,
      pendingInsert: null,
      loading: false,
    });
  } catch (error) {
    setState({
      loading: false,
      statusMessage:
        error instanceof Error
          ? error.message
          : 'Unable to load the extension.',
    });
  }
}

function renderReady(
  apiBaseUrl: string,
  currentTabId: number | null,
  currentTab: { url: string | null; title: string | null }
) {
  const summary = state.summary;
  if (!summary) {
    renderSignedOut();
    return;
  }

  if (summary.status === 'unsupported') {
    renderEmptyState(summary.shellCopy.title, summary.shellCopy.body);
    return;
  }

  if (summary.status === 'no_match') {
    renderEmptyState(summary.shellCopy.title, summary.shellCopy.body);
    return;
  }

  const domainMode = getMatchingDomainMode(state.flags, summary.context.host);
  if (domainMode === 'off') {
    renderEmptyState(
      'This Domain Is Turned Off',
      'Jovie has this workflow disabled right now. Your context is safe, but insert actions are unavailable.'
    );
    return;
  }

  const children: HTMLElement[] = [renderSummaryCard(summary)];

  if (!state.domainPermissionGranted) {
    children.push(renderPermissionCard(summary.context.host));
    renderShell(children);
    return;
  }

  const candidateList = document.createElement('section');
  candidateList.className = 'stack-sm';

  const listTitle = document.createElement('p');
  listTitle.className = 'eyebrow';
  listTitle.textContent = 'Entities';
  candidateList.appendChild(listTitle);

  for (const entity of summary.entities) {
    candidateList.appendChild(renderCandidateCard(entity));
  }

  children.push(candidateList);

  const discovery = renderDiscovery(summary);
  if (discovery) {
    children.push(discovery);
  }

  const selectedEntity = getSelectedEntity();
  const pendingField = getPendingField();

  if (selectedEntity) {
    if (pendingField) {
      children.push(renderPreviewCard(selectedEntity, pendingField));
    }

    children.push(renderEntityDetail(selectedEntity));

    const actionTray = document.createElement('section');
    actionTray.className = 'action-tray';

    const primaryField = selectedEntity.fields[0] ?? null;

    if (pendingField && currentTabId !== null && domainMode === 'write') {
      actionTray.appendChild(
        createButton('Confirm Insert', 'primary', async () => {
          await confirmInsert(
            apiBaseUrl,
            currentTabId,
            currentTab,
            selectedEntity,
            pendingField
          );
        })
      );

      actionTray.appendChild(
        createButton('Cancel', 'secondary', () => {
          setState({ pendingInsert: null, statusMessage: null });
        })
      );
    } else if (primaryField && domainMode === 'write') {
      actionTray.appendChild(
        createButton(
          selectedEntity.primaryAction.label,
          'primary',
          async () => {
            if (currentTabId === null) {
              setState({ statusMessage: 'No active tab available.' });
              return;
            }

            try {
              const preview = await getInsertPreview(currentTabId);
              startInsertPreview(selectedEntity, primaryField, preview);
            } catch (error) {
              setState({
                statusMessage:
                  error instanceof Error
                    ? error.message
                    : 'Unable to build an insert preview.',
              });
            }
          }
        )
      );
    }

    if (primaryField) {
      actionTray.appendChild(
        createButton('Copy', 'secondary', async () => {
          await copyValue(primaryField.label, primaryField.value);
        })
      );
    }

    children.push(actionTray);
  }

  renderShell(children);
}

function render() {
  if (state.loading && !state.summary && !state.flags) {
    renderLoading();
    return;
  }

  if (!state.flags?.signedIn) {
    renderSignedOut();
    return;
  }

  const selectedSummary = state.summary;
  if (!selectedSummary) {
    renderEmptyState(
      'Jovie Is Standing By',
      'Open a supported page to load your context.'
    );
    return;
  }

  void resolveActiveTab().then(async tab => {
    const currentTab = {
      url: tab?.url ?? null,
      title: tab?.title ?? null,
    };
    const apiBaseUrl = await resolveApiBaseUrl(currentTab.url);
    const domainPermissionGranted = await hasDomainPermission(currentTab.url);
    if (domainPermissionGranted !== state.domainPermissionGranted) {
      state = {
        ...state,
        currentTabId: tab?.id ?? null,
        currentTabUrl: currentTab.url,
        currentTabTitle: currentTab.title,
        domainPermissionGranted,
      };
    }
    renderReady(apiBaseUrl, tab?.id ?? null, currentTab);
  });
}

void load();

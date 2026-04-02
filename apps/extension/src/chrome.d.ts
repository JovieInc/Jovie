interface ChromeStorageArea {
  get(
    keys?: string | string[] | Record<string, unknown> | null
  ): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromePermissionsApi {
  contains(permissions: { origins?: string[] }): Promise<boolean>;
  request(permissions: { origins?: string[] }): Promise<boolean>;
}

interface ChromeTabsTab {
  readonly id?: number;
  readonly title?: string;
  readonly url?: string;
}

interface ChromeRuntimeMessageSender {
  readonly tab?: ChromeTabsTab;
}

interface ChromeSidePanelApi {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
}

interface ChromeActionApi {
  onClicked: {
    addListener(callback: (tab: ChromeTabsTab) => void): void;
  };
}

interface ChromeTabsApi {
  query(queryInfo: {
    active: boolean;
    currentWindow: boolean;
  }): Promise<ChromeTabsTab[]>;
  sendMessage(
    tabId: number,
    message: unknown
  ): Promise<{ ok: boolean; error?: string }>;
}

interface ChromeRuntimeApi {
  lastError?: {
    readonly message?: string;
  };
  onInstalled: {
    addListener(callback: () => void): void;
  };
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: ChromeRuntimeMessageSender,
        sendResponse: (response: unknown) => void
      ) => boolean | void
    ): void;
  };
}

interface ChromeGlobal {
  readonly action?: ChromeActionApi;
  readonly runtime?: ChromeRuntimeApi;
  readonly sidePanel?: ChromeSidePanelApi;
  readonly permissions?: ChromePermissionsApi;
  readonly storage?: {
    readonly local: ChromeStorageArea;
  };
  readonly tabs?: ChromeTabsApi;
}

declare const chrome: ChromeGlobal | undefined;

declare global {
  interface GlobalThis {
    readonly chrome?: ChromeGlobal;
  }
}

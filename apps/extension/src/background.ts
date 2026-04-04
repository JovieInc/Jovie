declare const chrome: ChromeGlobal | undefined;

export {};

async function enableActionClickPanel() {
  if (!chrome?.sidePanel) return;

  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch {
    // Keep the service worker quiet if side panel APIs are unavailable.
  }
}

chrome?.runtime?.onInstalled.addListener(() => {
  void enableActionClickPanel();
});

chrome?.action?.onClicked.addListener(() => {
  void enableActionClickPanel();
});

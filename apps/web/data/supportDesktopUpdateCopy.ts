/**
 * Desktop updater UI copy (JOV-6683). Product-UI register: short, literal,
 * no em dashes, state shown once.
 */
export const DESKTOP_UPDATE_COPY = {
  menu: {
    readyLabel: 'Restart to update',
    errorLabel: 'Update failed, retry',
    updateToLabel: (version: string) => `Update to ${version}`,
    downloadingLabel: (percent: number) =>
      `Downloading ${Math.round(percent)}%`,
  },
  modal: {
    availableTitle: (version: string) => `Jovie ${version} Is Available`,
    downloadingTitle: (version: string | null) =>
      version ? `Downloading Jovie ${version}` : 'Downloading Update',
    readyTitle: (version: string) => `Jovie ${version} Is Ready`,
    errorTitle: 'Update Did Not Download',
    released: (date: string) => `Released ${date}`,
    downloadingDescription: 'Keep working. Jovie tells you when it is ready.',
    readyDescription:
      'Restart Jovie to finish installing. It takes a few seconds.',
    errorDescription: 'Check your connection and try again.',
    errorFinalDescription:
      'Download the latest version from jov.ie/download to update.',
    notesHeading: "What's New",
    notesFallbackLabel: 'Read the Release Notes',
    downloadAction: 'Download',
    restartAction: 'Restart To Update',
    retryAction: 'Try Again',
    laterAction: 'Later',
    hideAction: 'Hide',
    progressLabel: 'Download Progress',
    transferred: (done: string, total: string) => `${done} of ${total}`,
    speed: (rate: string) => `${rate}/s`,
  },
} as const;

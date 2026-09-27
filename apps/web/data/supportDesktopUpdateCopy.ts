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
    title: (version: string) => `Jovie ${version} is available`,
    downloadingTitle: 'Downloading update',
    readyTitle: 'Update ready to install',
    errorTitle: 'Update failed',
    notesHeading: 'What is new',
    notesFallbackLabel: 'Read the release notes',
    notesUnavailable: 'Release notes are not available for this version yet.',
    downloadAction: 'Download',
    restartAction: 'Restart to update',
    retryAction: 'Retry',
    laterAction: 'Later',
    closeLabel: 'Close',
    progressLabel: 'Download progress',
    errorDescription:
      'The update could not be downloaded. Check your connection and try again.',
    readyDescription:
      'The update is downloaded. Restart Jovie to finish installing it.',
  },
} as const;

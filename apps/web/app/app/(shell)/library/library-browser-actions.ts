export function defaultOpenUrl(url: string): void {
  globalThis.open(url, '_blank', 'noopener,noreferrer');
}

export function defaultCopyText(value: string): void {
  void globalThis.navigator?.clipboard?.writeText(value);
}

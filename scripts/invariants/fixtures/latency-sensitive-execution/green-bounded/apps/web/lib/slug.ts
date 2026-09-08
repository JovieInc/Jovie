// Small bounded CPU transform. Not I/O. Not a thread-blocking *Sync API.
export function slugify(title: string | undefined): string {
  return title?.replaceAll(' ', '-').toLowerCase() ?? '';
}

export function parseHandle(raw: string): { handle: string } {
  return JSON.parse(raw) as { handle: string };
}

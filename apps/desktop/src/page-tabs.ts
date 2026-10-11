export const PAGE_TABS_GET_CHANNEL = 'desktop-page-tabs-get';
export const PAGE_TABS_COMMAND_CHANNEL = 'desktop-page-tabs-command';
export const PAGE_TABS_CHANGED_CHANNEL = 'desktop-page-tabs-changed';

export interface PageTab {
  readonly id: number;
  readonly title: string;
  readonly loading: boolean;
}

export interface PageTabsState {
  readonly activeId: number;
  readonly tabs: readonly PageTab[];
}

export type PageTabsCommand =
  | { readonly type: 'create' }
  | { readonly type: 'select' | 'close'; readonly id: number };

/** Convert the hosted document's CSS rectangle into native window points. */
export function parsePageTabsBounds(
  value: unknown,
  zoom: number,
  size: readonly [number, number]
) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Number.isFinite(zoom) ||
    zoom <= 0
  )
    return null;
  const { x, y, width, height, dark, ov } = value as Record<string, unknown>;
  if (
    ![x, y, width, height].every(
      n => typeof n === 'number' && Number.isFinite(n)
    ) ||
    typeof dark !== 'boolean' ||
    typeof ov !== 'boolean' ||
    (x as number) < 0 ||
    (y as number) < 0 ||
    (width as number) <= 0 ||
    (height as number) <= 0 ||
    (height as number) > 64
  )
    return null;
  const left = Math.round((x as number) * zoom);
  const right = Math.round(((x as number) + (width as number)) * zoom);
  const top = Math.round((y as number) * zoom);
  const bottom = Math.round(((y as number) + (height as number)) * zoom);
  const safeX = Math.max(left, 80);
  if (right > size[0] || bottom > size[1] || right <= safeX || bottom <= top)
    return null;
  return {
    bounds: { x: safeX, y: top, width: right - safeX, height: bottom - top },
    appearance: { dark, ov },
  };
}

export function parsePageTabsCommand(value: unknown): PageTabsCommand | null {
  if (!value || typeof value !== 'object') return null;
  const command = value as Record<string, unknown>;
  if (command.type === 'create' && Object.keys(command).length === 1)
    return { type: 'create' };
  if (
    (command.type === 'select' || command.type === 'close') &&
    Object.keys(command).length === 2 &&
    Number.isSafeInteger(command.id) &&
    (command.id as number) > 0
  )
    return { type: command.type, id: command.id as number };
  return null;
}

/** Owns live pages, never route snapshots. Hidden pages keep their documents. */
export class WindowPageTabs<Page> {
  private readonly pages = new Map<number, { page: Page; tab: PageTab }>();
  private activeId = 0;
  private nextId = 1;
  private disposed = false;
  private queue: Promise<boolean> = Promise.resolve(true);

  constructor(
    private readonly host: {
      readonly create: () => Page;
      readonly show: (page: Page, previous: Page | undefined) => void;
      readonly close: (page: Page) => void;
      readonly canClose: (page: Page) => Promise<boolean>;
      readonly publish: (state: PageTabsState) => void;
    }
  ) {}

  get active(): Page | undefined {
    return this.pages.get(this.activeId)?.page;
  }

  get all(): readonly Page[] {
    return [...this.pages.values()].map(({ page }) => page);
  }

  state(): PageTabsState {
    return {
      activeId: this.activeId,
      tabs: [...this.pages.values()].map(({ tab }) => tab),
    };
  }

  idFor(page: Page): number | undefined {
    return [...this.pages].find(([, entry]) => entry.page === page)?.[0];
  }

  update(
    page: Page,
    update: Partial<Pick<PageTab, 'title' | 'loading'>>
  ): void {
    const id = this.idFor(page);
    if (id === undefined || this.disposed) return;
    const entry = this.pages.get(id);
    if (!entry) return;
    entry.tab = { ...entry.tab, ...update };
    this.host.publish(this.state());
  }

  create(): boolean {
    if (this.disposed) return false;
    const page = this.host.create();
    const id = this.nextId++;
    this.pages.set(id, { page, tab: { id, title: 'New Chat', loading: true } });
    return this.select(id);
  }

  select(id: number): boolean {
    if (this.disposed) return false;
    const entry = this.pages.get(id);
    if (!entry) return false;
    const previous = this.active;
    this.activeId = id;
    this.host.show(entry.page, previous);
    this.host.publish(this.state());
    return true;
  }

  /** Serialize close confirmation with all other commands; recheck after await. */
  command(command: PageTabsCommand): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      if (this.disposed) return false;
      if (command.type === 'create') return this.create();
      if (command.type === 'select') return this.select(command.id);
      const entry = this.pages.get(command.id);
      if (!entry || !(await this.host.canClose(entry.page)) || this.disposed)
        return false;
      if (this.pages.size === 1 && !this.create()) return false;
      const ids = [...this.pages.keys()];
      const index = ids.indexOf(command.id);
      if (this.activeId === command.id) {
        this.select(ids[index + 1] ?? ids[index - 1]);
      }
      this.pages.delete(command.id);
      this.host.close(entry.page);
      this.host.publish(this.state());
      return true;
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { page } of this.pages.values()) this.host.close(page);
    this.pages.clear();
  }
}

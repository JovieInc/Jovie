import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');

function readSource(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('Tasks desktop density controls', () => {
  it('keeps Tasks filter tabs at a 32px visible size with mobile hit room', () => {
    const header = readSource(
      'components/features/dashboard/tasks/TaskWorkspaceHeaderBar.tsx'
    );
    const tabBar = readSource('components/molecules/tab-bar/TabBar.tsx');

    expect(header).toContain('const TASK_FILTER_TAB_CLASSNAME = cn(');
    expect(header).toContain("'relative h-8 gap-1.5 px-2 text-xs'");
    expect(header).toContain(
      'before:h-11 before:min-w-11 before:w-full'
    );
    expect(header).toContain('sm:before:h-8 sm:before:min-w-0');
    expect(header).toContain('triggerClassName={TASK_FILTER_TAB_CLASSNAME}');
    expect(header).not.toContain("triggerClassName='gap-1.5 px-2 text-xs'");

    expect(tabBar).toContain(
      'const TAB_BAR_SEGMENT_OVERFLOW_TRIGGER_CLASSNAME'
    );
    expect(tabBar).toContain("'h-8 w-8 sm:before:h-8 sm:before:w-8'");
  });

  it('keeps Tasks toolbar icon actions at 32px on desktop without a desktop 44px hit target', () => {
    const header = readSource(
      'components/features/dashboard/tasks/TaskWorkspaceHeaderBar.tsx'
    );

    expect(header).toContain('const TASK_TOOLBAR_ICON_BUTTON_CLASSNAME = cn(');
    expect(header).toContain("'h-8 w-8 px-0'");
    expect(header).toContain('sm:before:h-8 sm:before:min-w-0');
    expect(header).toContain("'sm:before:w-8'");
    expect(header).toContain(
      'buttonClassName={TASK_TOOLBAR_ICON_BUTTON_CLASSNAME}'
    );
    expect(header).toContain(
      'className={TASK_TOOLBAR_ICON_BUTTON_CLASSNAME}'
    );
  });

  it('keeps canonical Tasks stage and priority triggers at 32px on desktop', () => {
    const source = readSource(
      'components/features/dashboard/tasks/TasksPageClient.tsx'
    );

    expect(source).toContain(
      '-mx-1 relative inline-flex h-8 min-w-0 items-center rounded-full px-2'
    );
    expect(source).toContain(
      'before:h-11 before:min-w-11 before:w-full'
    );
    expect(source).toContain('sm:before:h-8 sm:before:min-w-0');
    expect(source).toContain(
      "<TaskMetaTrigger ariaLabel='Change Task Status'>"
    );
    expect(source).toContain(
      "<TaskMetaTrigger ariaLabel='Change Task Priority'>"
    );
  });

  it('keeps Tasks board icon actions at 32px on desktop', () => {
    const source = readSource(
      'components/features/dashboard/tasks/TaskBoard.tsx'
    );

    expect(source).toContain('relative inline-flex h-8 w-8 shrink-0');
    expect(source).toContain('before:h-11 before:w-11');
    expect(source).toContain('sm:before:h-8 sm:before:w-8');
    expect(source).not.toContain('inline-flex h-7 w-7 shrink-0');
  });
});

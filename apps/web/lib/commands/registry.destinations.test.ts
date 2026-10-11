import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { buildCommands, COMMANDS } from './registry';

function navHref(
  id: string,
  commands: typeof COMMANDS = COMMANDS
): string | undefined {
  const command = commands.find(entry => entry.id === id);
  return command?.kind === 'nav' ? command.href : undefined;
}

describe('command destinations', () => {
  it('opens the Releases workspace', () => {
    expect(navHref('go-releases')).toBe(APP_ROUTES.RELEASES);
  });

  it('gives shipped workspaces a command row', () => {
    const enabled = buildCommands({
      youtubeWorkspaceNav: true,
      jovieWorkNav: true,
    });
    expect(navHref('go-youtube', enabled)).toBe(APP_ROUTES.YOUTUBE_REVIVAL);
    expect(navHref('go-insights')).toBe(APP_ROUTES.INSIGHTS);
    expect(navHref('go-jovie-work', enabled)).toBe(APP_ROUTES.JOVIE_WORK);
    expect(navHref('go-tour-dates')).toBe(APP_ROUTES.TOUR_DATES);
    expect(navHref('go-calendar')).toBe(APP_ROUTES.CALENDAR);
    expect(navHref('go-tasks')).toBe(APP_ROUTES.TASKS);
  });

  it('keeps gated workspace destinations absent until enabled', () => {
    const disabled = buildCommands({
      youtubeWorkspaceNav: false,
      jovieWorkNav: false,
    });
    expect(navHref('go-youtube', disabled)).toBeUndefined();
    expect(navHref('go-jovie-work', disabled)).toBeUndefined();
  });

  it('uses identity wording in profile commands', () => {
    const descriptions = COMMANDS.map(command => command.description).join(
      '\n'
    );
    expect(descriptions).not.toContain('artist profile');
    expect(descriptions).not.toContain('artist settings');
  });
});

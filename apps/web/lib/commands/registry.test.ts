import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { PRODUCT_ONTOLOGY } from '@/data/productOntology';
import {
  buildCommands,
  COMMANDS,
  commandsForSurface,
  type NavCommand,
} from './registry';

function navCommands(commands: readonly { kind: string }[]): NavCommand[] {
  return commands.filter(
    (command): command is NavCommand => command.kind === 'nav'
  );
}

describe('command registry navigation', () => {
  it('opens approved workspaces and hides doors Tim has not approved', () => {
    const byId = new Map(
      navCommands(COMMANDS).map(command => [command.id, command])
    );

    expect(byId.get('go-work')).toMatchObject({
      label: PRODUCT_ONTOLOGY.work.label,
      href: PRODUCT_ONTOLOGY.work.canonicalRoute,
    });
    expect(byId.get('go-audience')?.href).toBe(APP_ROUTES.CONTACTS_AUDIENCE);
    expect(byId.get('go-links')?.href).toBe(APP_ROUTES.LINKS);
    expect(byId.get('go-tour-dates')?.href).toBe(APP_ROUTES.TOUR_DATES);
    expect(byId.get('go-presence')).toMatchObject({
      label: PRODUCT_ONTOLOGY.identity.label,
      href: APP_ROUTES.PRESENCE,
    });
    expect(byId.has('go-youtube')).toBe(false);
    expect(byId.has('go-jovie-work')).toBe(false);
    expect(byId.has('go-calendar')).toBe(true);
    expect(byId.has('go-tasks')).toBe(true);
  });

  it('keeps workspace navigation out of the slash picker even when enabled', () => {
    expect(
      commandsForSurface('chat-slash', {
        youtubeWorkspaceNav: true,
        jovieWorkNav: true,
      }).every(command => command.kind === 'skill')
    ).toBe(true);
  });

  it('uses profile wording on shared commands', () => {
    const social = COMMANDS.find(command => command.id === 'proposeSocialLink');
    const removal = COMMANDS.find(
      command => command.id === 'proposeSocialLinkRemoval'
    );
    const settings = navCommands(COMMANDS).find(
      command => command.id === 'go-settings'
    );

    expect(social?.description).toBe(
      'Add a social profile URL to your profile.'
    );
    expect(removal?.description).toBe(
      'Remove a social link from your profile.'
    );
    expect(settings?.description).toBe(
      'Account, billing, and profile settings.'
    );
  });

  it('shows YouTube and Jovie work only when those flags are on', () => {
    const ids = navCommands(
      buildCommands({ youtubeWorkspaceNav: true, jovieWorkNav: true })
    ).map(command => command.id);

    expect(ids).toContain('go-youtube');
    expect(ids).toContain('go-jovie-work');
  });
});

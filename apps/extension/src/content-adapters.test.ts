import { describe, expect, it } from 'vitest';
import { buildPreviewResponse, findAdapterForHost } from './content-adapters';

function createDocument(html: string) {
  document.body.innerHTML = html;
  return document;
}

function setActiveElement(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();

  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => element,
  });

  return element;
}

describe('content adapters', () => {
  it('matches the gmail compose adapter on mail.google.com', () => {
    const adapter = findAdapterForHost('mail.google.com');

    expect(adapter?.id).toBe('gmail-compose');
  });

  it('builds a preview for a focused gmail compose target', () => {
    const doc = createDocument(
      '<div role="textbox" g_editable="true" contenteditable="true"></div>'
    );
    setActiveElement('div[role="textbox"]');

    const response = buildPreviewResponse('mail.google.com', doc);

    expect(response).toEqual({
      ok: true,
      adapterId: 'gmail-compose',
      targetLabel: 'Gmail Compose Body',
    });
  });

  it('builds a preview for a focused genius textarea target', () => {
    const doc = createDocument('<textarea></textarea>');
    setActiveElement('textarea');

    const response = buildPreviewResponse('genius.com', doc);

    expect(response).toEqual({
      ok: true,
      adapterId: 'genius-lyrics',
      targetLabel: 'Lyrics Field',
    });
  });

  it('rejects unsupported focused fields on a supported page', () => {
    const doc = createDocument('<input type="email" />');
    setActiveElement('input');

    const response = buildPreviewResponse('eventbrite.com', doc);

    expect(response).toEqual({
      ok: false,
      adapterId: 'event-form',
      error: 'Focus a supported field before inserting.',
    });
  });

  it('rejects unsupported hosts', () => {
    const doc = createDocument('<textarea></textarea>');

    const response = buildPreviewResponse('example.com', doc);

    expect(response).toEqual({
      ok: false,
      error: 'No supported adapter is active on this page.',
    });
  });

  it('matches the awal-project adapter on workstation.awal.com', () => {
    const adapter = findAdapterForHost('workstation.awal.com');

    expect(adapter?.id).toBe('awal-project');
  });

  it('builds a preview for a focused AWAL project name field', () => {
    const doc = createDocument(
      '<input type="text" placeholder="Project name" />'
    );
    setActiveElement('input[placeholder="Project name"]');

    const response = buildPreviewResponse('workstation.awal.com', doc);

    expect(response).toEqual({
      ok: true,
      adapterId: 'awal-project',
      targetLabel: 'Project Name',
    });
  });

  it('matches the kosign-work adapter on app.kosignmusic.com', () => {
    const adapter = findAdapterForHost('app.kosignmusic.com');

    expect(adapter?.id).toBe('kosign-work');
  });

  it('builds a preview for a focused Kosign song title field', () => {
    const doc = createDocument('<input type="text" name="workTitle" />');
    setActiveElement('input[name="workTitle"]');

    const response = buildPreviewResponse('app.kosignmusic.com', doc);

    expect(response).toEqual({
      ok: true,
      adapterId: 'kosign-work',
      targetLabel: 'Song Title',
    });
  });
});

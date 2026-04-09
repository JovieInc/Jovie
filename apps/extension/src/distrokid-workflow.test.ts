import { describe, expect, it } from 'vitest';
import {
  buildWorkflowPreviewResponse,
  inventoryWorkflow,
} from './distrokid-workflow';

const SUPPORTED_FIXTURE = `
  <form>
    <input id="album_title" name="album_title" data-jovie-target="release_title" />
    <input id="artist_name" name="artist_name" data-jovie-target="artist_name" />
    <input id="release_date" name="release_date" data-jovie-target="release_date" />
    <select id="primary_genre" name="primary_genre" data-jovie-target="primary_genre"></select>
    <section data-jovie-track-row>
      <input data-jovie-target="track_title" />
      <input type="checkbox" data-jovie-target="explicit" />
      <input data-jovie-target="track_isrc" />
    </section>
    <section data-jovie-track-row>
      <input data-jovie-target="track_title" />
      <select data-jovie-target="explicit"></select>
      <input data-jovie-target="producer" />
    </section>
  </form>
`;

const UNSUPPORTED_FIXTURE = `
  <form>
    <input id="album_title" name="album_title" data-jovie-target="release_title" />
  </form>
`;

function createDocument(html: string) {
  document.body.innerHTML = html;
  return document;
}

describe('DistroKid workflow inventory', () => {
  it('discovers release and repeated track targets from the supported fixture', () => {
    const response = buildWorkflowPreviewResponse(
      'distrokid.com',
      createDocument(SUPPORTED_FIXTURE)
    );

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);
    expect(response.pageVariant).toBe('release_form_v1');
    expect(response.availableTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetId: 'release_title' }),
        expect.objectContaining({ targetId: 'track_title:0', groupIndex: 0 }),
        expect.objectContaining({ targetId: 'explicit:1', groupIndex: 1 }),
        expect.objectContaining({ targetId: 'producer:1', groupIndex: 1 }),
      ])
    );
  });

  it('marks incomplete fixtures as fallback-only', () => {
    const inventory = inventoryWorkflow(createDocument(UNSUPPORTED_FIXTURE));

    expect(inventory.pageVariant).toBeNull();
    expect(inventory.availableTargets).toEqual([
      expect.objectContaining({
        targetId: 'release_title',
        targetKey: 'release_title',
      }),
    ]);
  });
});

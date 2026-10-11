import { getChangelogSnapshot } from '@/lib/changelog-source';

export const revalidate = false;

/**
 * Release notes for the desktop update modal (JOV-6683). Returns the public
 * changelog entries for one version; the modal falls back to the notesUrl
 * link when the version has none yet.
 */
export async function GET(request: Request) {
  const version = new URL(request.url).searchParams.get('version');
  if (!version) {
    return Response.json({ error: 'missing-version' }, { status: 400 });
  }

  const snapshot = await getChangelogSnapshot();
  const release = snapshot.releases.find(entry => entry.version === version);
  if (!release) {
    return Response.json({ summary: '', items: [] });
  }

  const items = [
    ...release.sections.featured,
    ...release.sections.added,
    ...release.sections.changed,
    ...release.sections.fixed,
    ...release.sections.removed,
  ];

  return Response.json(
    { summary: release.summary, items, date: release.date },
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}

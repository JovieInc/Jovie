# MusicBrainz fixtures

Captured from the official public MusicBrainz API on 2026-10-03:

- Artist: https://musicbrainz.org/ws/2/artist/51972833-bb04-46b7-9401-45a5ab449ebd?inc=aliases+url-rels+release-groups&fmt=json
- Exact Spotify relationship: https://musicbrainz.org/ws/2/url?resource=https%3A%2F%2Fopen.spotify.com%2Fartist%2F4Uwpa6zW3zzCSQvooQNksm&inc=artist-rels&fmt=json

The artist fixture projects the identity fields, URL relationships, and release-group identifiers used by the resolver. It excludes supplementary tags, genres, ratings, annotations, and unrelated fields. These core MusicBrainz data are CC0: https://musicbrainz.org/doc/About/Data_License.

The URL fixture retains the exact reverse-relationship response. Tests use real provider and resolver code; only external HTTP and quota/circuit boundaries are mocked. No Musicfetch response is used as a fixture.

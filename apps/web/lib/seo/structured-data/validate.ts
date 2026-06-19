type SchemaNode = Record<string, unknown>;

function hasType(node: SchemaNode, ...types: string[]): boolean {
  const nodeType = node['@type'];
  if (typeof nodeType === 'string') {
    return types.includes(nodeType);
  }
  if (Array.isArray(nodeType)) {
    return types.some(type => nodeType.includes(type));
  }
  return false;
}

function findInGraph(graph: unknown[], ...types: string[]): SchemaNode | null {
  for (const item of graph) {
    if (
      item &&
      typeof item === 'object' &&
      hasType(item as SchemaNode, ...types)
    ) {
      return item as SchemaNode;
    }
  }
  return null;
}

function assertRequired(
  node: SchemaNode | null,
  label: string,
  fields: string[]
): string[] {
  if (!node) {
    return [`${label}: missing node`];
  }
  return fields.filter(field => node[field] == null || node[field] === '');
}

/** Validate profile JSON-LD meets Google entity + event rich-result requirements. */
export function validateProfileRichResults(
  data: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  const graph = data['@graph'];
  if (!Array.isArray(graph)) {
    return ['@graph must be an array'];
  }

  const artist = findInGraph(graph, 'MusicGroup', 'Person');
  errors.push(
    ...assertRequired(artist, 'Artist entity', ['name', 'url', 'sameAs'])
  );
  if (artist && !hasType(artist, 'MusicGroup')) {
    errors.push('Artist entity: must include MusicGroup');
  }

  const events = graph.filter(
    item =>
      item &&
      typeof item === 'object' &&
      hasType(item as SchemaNode, 'MusicEvent')
  ) as SchemaNode[];

  for (const [index, event] of events.entries()) {
    errors.push(
      ...assertRequired(event, `MusicEvent[${index}]`, [
        'name',
        'startDate',
        'location',
        'offers',
      ])
    );
    const startDate = event.startDate;
    if (
      typeof startDate === 'string' &&
      !/[+-]\d{2}:\d{2}|Z$/.test(startDate)
    ) {
      errors.push(
        `MusicEvent[${index}]: startDate must include timezone offset`
      );
    }
  }

  return errors;
}

/** Validate music asset JSON-LD for recording/album entity signals. */
export function validateMusicRichResults(
  data: Record<string, unknown>
): string[] {
  const errors: string[] = [];
  const graph = data['@graph'];
  if (!Array.isArray(graph)) {
    return ['@graph must be an array'];
  }

  const music = graph.find(
    item =>
      item &&
      typeof item === 'object' &&
      (hasType(item as SchemaNode, 'MusicRecording') ||
        hasType(item as SchemaNode, 'MusicAlbum') ||
        hasType(item as SchemaNode, 'MusicRelease'))
  ) as SchemaNode | undefined;

  if (!music) {
    return ['music content node missing'];
  }

  errors.push(
    ...assertRequired(music, 'Music content', ['name', 'url', 'byArtist'])
  );

  if (hasType(music, 'MusicRecording')) {
    errors.push(...assertRequired(music, 'MusicRecording', ['duration']));
    if (music.isrcCode == null || music.isrcCode === '') {
      errors.push('MusicRecording: isrcCode required when available on page');
    }
    if (!music.inAlbum) {
      errors.push('MusicRecording: inAlbum required for track pages');
    }
  } else if (hasType(music, 'MusicAlbum') || hasType(music, 'MusicRelease')) {
    if (!hasType(music, 'MusicAlbum') || !hasType(music, 'MusicRelease')) {
      errors.push(
        'Release: must include both MusicAlbum and MusicRelease types'
      );
    }
  }

  return errors;
}

/** Validate merch Product JSON-LD for product rich-result eligibility. */
export function validateMerchRichResults(
  data: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  if (data['@type'] !== 'Product') {
    errors.push('root @type must be Product');
  }

  errors.push(...assertRequired(data, 'Product', ['name', 'offers']));

  const offers = data.offers;
  if (!offers || typeof offers !== 'object') {
    errors.push('Product: offers must be an object');
    return errors;
  }

  errors.push(
    ...assertRequired(offers as SchemaNode, 'Offer', [
      'price',
      'priceCurrency',
      'availability',
      'url',
    ])
  );

  if (data.aggregateRating) {
    const rating = data.aggregateRating as SchemaNode;
    errors.push(
      ...assertRequired(rating, 'AggregateRating', [
        'ratingValue',
        'reviewCount',
      ])
    );
  }

  return errors;
}

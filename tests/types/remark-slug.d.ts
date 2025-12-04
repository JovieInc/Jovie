import type { Root } from 'mdast';
import type { Plugin } from 'unified';

declare module 'remark-slug' {
  const remarkSlug: Plugin<[], Root>;
  export default remarkSlug;
}

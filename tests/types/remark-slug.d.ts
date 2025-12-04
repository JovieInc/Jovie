type RemarkPlugin = (this: unknown, ...args: unknown[]) => unknown;

declare module 'remark-slug' {
  const remarkSlug: RemarkPlugin;
  export default remarkSlug;
}

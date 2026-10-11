/** Serializable nav tree produced by `buildHelpNav` in lib/help-nav.mjs. */
export type HelpNavItem = {
  key: string;
  title: string;
  route: string | null;
  children: HelpNavItem[];
};

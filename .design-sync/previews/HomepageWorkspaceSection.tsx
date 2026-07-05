// Authored preview — HomepageWorkspaceSection. Scroll-reactive workspace section
// with the releases workspace screenshot. Uses the self-contained data-URI thumb.
import { HomepageWorkspaceSection } from 'apps/web/components';
import { IMG } from './_images';

export function Workspace() {
  return <HomepageWorkspaceSection screenshot={IMG.releases} />;
}

import { redirectToProfileMode } from '../_lib/mode-route-redirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default async function ReleasesPage({ params }: Readonly<Props>) {
  return redirectToProfileMode(params, 'releases');
}

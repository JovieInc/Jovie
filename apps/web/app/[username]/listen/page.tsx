import { redirectToProfileMode } from '../_lib/mode-route-redirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default async function ListenPage({ params }: Props) {
  return redirectToProfileMode(params, 'listen');
}

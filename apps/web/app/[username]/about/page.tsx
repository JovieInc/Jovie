import { redirectToProfileMode } from '../_lib/mode-route-redirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default async function AboutPage({ params }: Props) {
  return redirectToProfileMode(params, 'about');
}

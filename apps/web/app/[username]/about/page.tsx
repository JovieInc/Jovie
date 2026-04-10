import { redirectToProfileMode } from '../_lib/mode-route-redirect';
import { getProfileStaticParams } from '../_lib/profile-static-params';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export async function generateStaticParams() {
  return getProfileStaticParams(100);
}

export default async function AboutPage({ params }: Props) {
  await redirectToProfileMode(params, 'about');
}

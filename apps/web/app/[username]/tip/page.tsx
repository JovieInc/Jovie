import { redirectToProfileMode } from '../_lib/mode-route-redirect';
import { getProfileStaticParams } from '../_lib/profile-static-params';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams?: Promise<{
    readonly source?: string | string[];
  }>;
}

export async function generateStaticParams() {
  return getProfileStaticParams(100);
}

export default async function TipPage({
  params,
  searchParams,
}: Readonly<Props>) {
  await redirectToProfileMode(params, searchParams, 'tip');
}

import { redirectToProfileMode } from '../_lib/mode-route-redirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams: Promise<{
    readonly source?: string | string[];
  }>;
}

export default async function SubscribePage({ params, searchParams }: Props) {
  await redirectToProfileMode(params, searchParams, 'subscribe');
}

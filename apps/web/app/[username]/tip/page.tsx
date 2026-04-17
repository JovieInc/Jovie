import { redirectToProfileMode } from '../_lib/mode-route-redirect';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
  readonly searchParams: Promise<{
    readonly source?: string | string[];
  }>;
}

/** Legacy /tip route — permanently redirects to /pay, preserving query params */
export default async function TipRedirectPage({
  params,
  searchParams,
}: Readonly<Props>) {
  return redirectToProfileMode(params, searchParams, 'pay');
}

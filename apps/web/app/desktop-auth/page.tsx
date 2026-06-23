import { DesktopAuthClient } from './DesktopAuthClient';

export const dynamic = 'force-dynamic';

type DesktopAuthSearchParams = Record<string, string | string[] | undefined>;

interface DesktopAuthPageProps {
  readonly searchParams?: Promise<DesktopAuthSearchParams>;
}

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function DesktopAuthPage({
  searchParams = Promise.resolve({}),
}: DesktopAuthPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <DesktopAuthClient
      authUrlParam={firstSearchParam(resolvedSearchParams.auth_url)}
    />
  );
}

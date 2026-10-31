import { DevDspDialFixture } from './DevDspDialFixture';

interface PageProps {
  readonly searchParams: Promise<{ fixture?: string; count?: string }>;
}

export default async function DevDspDialPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const fixture = params.fixture === 'synthetic' ? 'synthetic' : 'tim';
  const count = Math.min(200, Math.max(1, Number(params.count) || 100));
  return <DevDspDialFixture fixture={fixture} count={count} />;
}

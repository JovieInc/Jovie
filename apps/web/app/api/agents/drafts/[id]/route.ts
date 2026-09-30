import { handleAgentDraftGet } from '@/lib/agent-acquisition/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleAgentDraftGet(request, (await params).id);
}

import 'server-only';

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2';

interface PushLeadParams {
  email: string;
  firstName: string;
  claimLink: string;
  artistName: string;
  priorityScore: number;
}

export async function pushLeadToInstantly(
  params: PushLeadParams
): Promise<string> {
  const apiKey = process.env.INSTANTLY_API_KEY;
  const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;

  if (!apiKey || !campaignId) {
    throw new Error(
      'Instantly API not configured: missing INSTANTLY_API_KEY or INSTANTLY_CAMPAIGN_ID'
    );
  }

  const body = {
    campaign_id: campaignId,
    email: params.email,
    first_name: params.firstName,
    custom_variables: {
      claim_link: params.claimLink,
      artist_name: params.artistName,
      priority_score: String(params.priorityScore),
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${INSTANTLY_API_BASE}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429 && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Instantly API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.id ?? data.lead_id ?? '';
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (
        attempt === 0 &&
        !(error instanceof Error && error.message.includes('429'))
      ) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('Instantly push failed after retries');
}

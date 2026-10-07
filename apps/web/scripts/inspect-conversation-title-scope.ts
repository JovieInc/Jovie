import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import {
  type ConversationTitleRepairRecord,
  planConversationTitleRepairs,
} from '@/lib/chat/conversation-title-repair';

export async function inspectConversationTitleScope(
  args = process.argv.slice(2)
) {
  const [email, outputDir] = args;
  if (!email || !outputDir || !process.env.DATABASE_URL)
    throw new Error(
      'Expected verified owner email, private output directory, and DATABASE_URL.'
    );
  const query = neon(process.env.DATABASE_URL);
  const owners =
    await query`SELECT id FROM users WHERE lower(email) = lower(${email})`;
  if (owners.length !== 1)
    throw new Error(
      'Verified owner email must resolve to exactly one database actor.'
    );
  const userId = String(owners[0].id);
  const records =
    (await query`SELECT c.id, c.user_id AS "userId", c.creator_profile_id AS "creatorProfileId", c.title, (SELECT m.content FROM chat_messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.created_at ASC, m.id ASC LIMIT 1) AS "firstUserMessage" FROM chat_conversations c WHERE c.user_id = ${userId} AND (c.title LIKE 'Help me with this work.%' OR c.title LIKE 'Prod health check:%') LIMIT 201`) as unknown as ConversationTitleRepairRecord[];
  if (records.length > 200)
    throw new Error(
      'Candidate bound exceeded; inspect scope before continuing.'
    );
  const receipts = [];
  for (const creatorProfileId of new Set(
    records
      .map(record => record.creatorProfileId)
      .filter((id): id is string => Boolean(id))
  )) {
    const byId = new Map(records.map(record => [record.id, record]));
    const repairs = planConversationTitleRepairs(records, {
      userId,
      creatorProfileId,
    }).map(repair => ({
      ...repair,
      firstMessageSha256: createHash('sha256')
        .update(byId.get(repair.conversationId)!.firstUserMessage!)
        .digest('hex'),
    }));
    if (!repairs.length) continue;
    const output = join(
      outputDir,
      `conversation-title-repair-${creatorProfileId}.json`
    );
    await writeFile(
      output,
      `${JSON.stringify({ version: 'jovie.conversation-title-repair/v1', userId, creatorProfileId, repairs }, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' }
    );
    receipts.push({ creatorProfileId, candidates: repairs.length, output });
  }
  console.log(
    JSON.stringify({
      userId,
      inspectedCandidates: records.length,
      profiles: receipts,
    })
  );
}
if (
  basename(process.argv[1] ?? '').match(
    /^inspect-conversation-title-scope\.(?:ts|js)$/
  )
)
  void inspectConversationTitleScope().catch(() => {
    console.error(
      'Scope inspection failed. Check credentials, connectivity, and the explicit owner scope.'
    );
    process.exitCode = 1;
  });

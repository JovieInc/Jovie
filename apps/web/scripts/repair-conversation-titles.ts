import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { neon } from '@neondatabase/serverless';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { z } from 'zod';
import { planConversationTitleRepairs } from '@/lib/chat/conversation-title-repair';
import { chatConversations } from '@/lib/db/schema/chat';

export async function repairConversationTitles(args = process.argv.slice(2)) {
  // Standalone scripts are exempt from the app connection singleton. This
  // requires only DATABASE_URL, without unrelated restricted app secrets.
  const db = drizzle(neon(z.string().min(1).parse(process.env.DATABASE_URL)));
  // Explicit owner/profile scope is mandatory for planning, application, and rollback.
  const { values } = parseArgs({
    args,
    options: {
      'user-id': { type: 'string' },
      'profile-id': { type: 'string' },
      plan: { type: 'string' },
      apply: { type: 'string' },
      rollback: { type: 'string' },
    },
  });
  const userId = z.uuid().parse(values['user-id']);
  const creatorProfileId = z.uuid().parse(values['profile-id']);
  const modes = [values.plan, values.apply, values.rollback].filter(Boolean);
  if (modes.length !== 1)
    throw new Error(
      'Choose exactly one of --plan, --apply, or --rollback with a mapping file path.'
    );
  const firstUserMessage = drizzleSql<
    string | null
  >`(SELECT m.content FROM chat_messages m WHERE m.conversation_id = chat_conversations.id AND m.role = 'user' ORDER BY m.created_at ASC, m.id ASC LIMIT 1)`;
  const scope = { userId, creatorProfileId };
  const ownerCondition = and(
    eq(chatConversations.userId, userId),
    eq(chatConversations.creatorProfileId, creatorProfileId)
  );
  const digest = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  const mappingSchema = z.object({
    version: z.literal('jovie.conversation-title-repair/v1'),
    userId: z.uuid(),
    creatorProfileId: z.uuid(),
    repairs: z.array(
      z.object({
        conversationId: z.uuid(),
        userId: z.uuid(),
        creatorProfileId: z.uuid(),
        oldTitle: z.string().min(1),
        newTitle: z.string().min(1),
        firstMessageSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
    ),
  });

  if (values.plan) {
    const records = await db
      .select({
        id: chatConversations.id,
        userId: chatConversations.userId,
        creatorProfileId: chatConversations.creatorProfileId,
        title: chatConversations.title,
        firstUserMessage,
      })
      .from(chatConversations)
      .where(ownerCondition);
    const byId = new Map(records.map(record => [record.id, record]));
    const repairs = planConversationTitleRepairs(records, scope).map(
      repair => ({
        ...repair,
        firstMessageSha256: digest(
          byId.get(repair.conversationId)!.firstUserMessage!
        ),
      })
    );
    const mapping = mappingSchema.parse({
      version: 'jovie.conversation-title-repair/v1',
      ...scope,
      repairs,
    });
    await writeFile(values.plan, `${JSON.stringify(mapping, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    console.log(
      JSON.stringify({
        mode: 'plan',
        candidates: repairs.length,
        output: values.plan,
      })
    );
  } else {
    const mapping = mappingSchema.parse(
      JSON.parse(await readFile(modes[0]!, 'utf8'))
    );
    if (
      mapping.userId !== userId ||
      mapping.creatorProfileId !== creatorProfileId ||
      mapping.repairs.some(
        repair =>
          repair.userId !== userId ||
          repair.creatorProfileId !== creatorProfileId
      )
    )
      throw new Error(
        'Mapping owner/profile does not match the explicit scope.'
      );
    if (
      new Set(mapping.repairs.map(repair => repair.conversationId)).size !==
      mapping.repairs.length
    )
      throw new Error('Duplicate conversation mapping.');
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    const skippedReasons: Record<string, number> = {};
    const skip = (reason: string) => {
      skipped++;
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
    };
    {
      // Each record uses an atomic compare-and-swap; retrying the mapping is safe.
      const tx = db;
      for (const repair of mapping.repairs) {
        const [current] = await tx
          .select({
            id: chatConversations.id,
            userId: chatConversations.userId,
            creatorProfileId: chatConversations.creatorProfileId,
            title: chatConversations.title,
            firstUserMessage,
          })
          .from(chatConversations)
          .where(
            and(ownerCondition, eq(chatConversations.id, repair.conversationId))
          )
          .limit(1);
        const expected = values.rollback ? repair.newTitle : repair.oldTitle;
        const replacement = values.rollback ? repair.oldTitle : repair.newTitle;
        if (
          !current?.firstUserMessage ||
          digest(current.firstUserMessage) !== repair.firstMessageSha256
        ) {
          skip(
            !current
              ? 'record_missing'
              : !current.firstUserMessage
                ? 'message_missing'
                : 'message_changed'
          );
          continue;
        }
        if (current.title === replacement) {
          unchanged++;
          continue;
        }
        if (current.title !== expected) {
          skip('title_changed');
          continue;
        }
        // Revalidate the deterministic subject; a hand-edited mapping cannot retitle arbitrary history.
        const [candidate] = planConversationTitleRepairs(
          [{ ...current, title: repair.oldTitle }],
          scope
        );
        if (!candidate || candidate.newTitle !== repair.newTitle) {
          skip('mapping_subject_mismatch');
          continue;
        }
        const rows = await tx
          .update(chatConversations)
          .set({ title: replacement })
          .where(
            and(
              ownerCondition,
              eq(chatConversations.id, repair.conversationId),
              eq(chatConversations.title, expected),
              eq(firstUserMessage, current.firstUserMessage)
            )
          )
          .returning({ id: chatConversations.id });
        if (rows.length === 1) updated++;
        else skip('concurrent_change');
      }
    }
    console.log(
      JSON.stringify({
        mode: values.rollback ? 'rollback' : 'apply',
        updated,
        unchanged,
        skipped,
        skippedReasons,
      })
    );
  }
}
if (
  basename(process.argv[1] ?? '').match(
    /^repair-conversation-titles\.(?:ts|js)$/
  )
)
  void repairConversationTitles()
    .then(() => process.exit(0))
    .catch(() => {
      console.error(
        'Title repair failed. Check the explicit scope, mapping, and database connectivity.'
      );
      process.exit(1);
    });

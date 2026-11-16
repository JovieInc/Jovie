import { describe, expect, it } from 'vitest';
import {
  classifyRecordFileThread,
  contractKey,
  parseSenderHeader,
  type RecordFileThreadMetadata,
} from './classify';

function thread(
  subject: string | null,
  sender: { name?: string | null; domain?: string | null } = {},
  extra: Partial<RecordFileThreadMetadata> = {}
): RecordFileThreadMetadata {
  return {
    sourceRecordId: 'src-1',
    sourceType: 'gmail_message',
    externalId: 'gmail:src-1',
    subject,
    sender: { name: sender.name ?? null, domain: sender.domain ?? null },
    date: '2015-04-01T00:00:00.000Z',
    participants: [],
    ...extra,
  };
}

function kinds(input: RecordFileThreadMetadata): string[] {
  return classifyRecordFileThread(input).tags.map(tag => tag.kind);
}

describe('classifyRecordFileThread', () => {
  it('tags mastering-house notifications as mastering from the sender name', () => {
    const result = classifyRecordFileThread(
      thread('Your files are ready', { name: 'Northside Mastering' })
    );
    expect(result.tags).toEqual([
      expect.objectContaining({
        kind: 'mastering',
        rule: 'sender_name.mastering',
        confidence: 0.85,
        reason: 'sender is a mastering house',
      }),
    ]);
  });

  it('tags royalty-society and publishing-admin mail as registration with a target', () => {
    const society = classifyRecordFileThread(
      thread('Repertoire update', {
        name: 'Rights',
        domain: 'soundexchange.com',
      })
    );
    expect(society.tags[0]).toMatchObject({
      kind: 'registration',
      registrationTarget: 'soundexchange',
    });

    const admin = classifyRecordFileThread(
      thread('Split change confirmation', { name: 'Harbor Lane Publishing' })
    );
    expect(admin.tags.map(tag => [tag.kind, tag.registrationTarget])).toEqual(
      expect.arrayContaining([
        ['split_change', undefined],
        ['registration', 'publishing_admin'],
      ])
    );
  });

  it('tags distributor delivery mail as distribution, matching subdomains', () => {
    expect(
      kinds(thread('Release approved', { domain: 'mail.distrokid.com' }))
    ).toContain('distribution');
  });

  it('only tags YouTube mail as registration when the subject is about claims', () => {
    expect(kinds(thread('Weekly digest', { domain: 'youtube.com' }))).toEqual(
      []
    );
    expect(
      kinds(thread('New claims on your channel', { domain: 'youtube.com' }))
    ).toContain('registration');
  });

  it('tags remix agreement subjects as contract plus remix with a signature state', () => {
    const sent = classifyRecordFileThread(
      thread('Remix Agreement - Night Signal for signature')
    );
    expect(sent.tags.map(tag => tag.kind).sort()).toEqual([
      'contract',
      'remix',
    ]);
    expect(sent.tags.find(tag => tag.kind === 'contract')?.contractState).toBe(
      'sent'
    );

    const signed = classifyRecordFileThread(
      thread('Completed: Remix Agreement - Night Signal')
    );
    expect(
      signed.tags.find(tag => tag.kind === 'contract')?.contractState
    ).toBe('signed');
    expect(signed.contractKey).toBe(sent.contractKey);
  });

  it('leaves unknown threads untagged rather than guessing', () => {
    const result = classifyRecordFileThread(
      thread('Lunch next week?', { name: 'Theo Marsh', domain: 'theo.example' })
    );
    expect(result.tags).toEqual([]);
    expect(result.hints).toEqual([]);
    expect(result.contractKey).toBeNull();
    expect(classifyRecordFileThread(thread(null)).tags).toEqual([]);
  });

  it('does not read "remix" as a mix or "master use" as mastering', () => {
    expect(kinds(thread('Remix stems'))).toEqual(['remix']);
    expect(kinds(thread('Master use license request'))).not.toContain(
      'mastering'
    );
  });

  it('tags threads with a credited collaborator as collaborator threads', () => {
    const result = classifyRecordFileThread(
      thread(
        'quick idea',
        { name: 'Theo Marsh' },
        {
          participants: [{ name: 'milo  reyes', domain: null }],
        }
      ),
      { collaborators: [{ name: 'Milo Reyes', domain: null }] }
    );
    expect(result.tags).toEqual([
      expect.objectContaining({
        kind: 'collaborator_thread',
        rule: 'participant.collaborator',
      }),
    ]);
  });

  it('emits vocal, credit dispute and credit fix hints', () => {
    expect(classifyRecordFileThread(thread('vocal comp')).hints).toEqual([
      'vocal',
    ]);
    expect(
      classifyRecordFileThread(thread('Remix credited to wrong artist')).hints
    ).toEqual(['credit_dispute']);
    expect(
      classifyRecordFileThread(thread('Wrong artist credit fixed')).hints
    ).toEqual(['credit_fixed']);
    expect(
      classifyRecordFileThread(
        thread('Wrong artist credit on Remix, still not fixed')
      ).hints
    ).toEqual(['credit_dispute']);
    expect(
      classifyRecordFileThread(thread("Wrong credit hasn't been corrected"))
        .hints
    ).toEqual(['credit_dispute']);
    expect(
      classifyRecordFileThread(thread('Wrong artist credit, not yet fixed'))
        .hints
    ).toEqual(['credit_dispute']);
    expect(
      classifyRecordFileThread(
        thread('Wrong credit hasn’t been properly corrected')
      ).hints
    ).toEqual(['credit_dispute']);
    for (const subject of [
      "Wrong artist credit won't be fixed",
      'Wrong credit can’t be corrected',
      'Wrong credit cannot be updated',
      "Wrong artist credit didn't get resolved",
    ]) {
      expect(classifyRecordFileThread(thread(subject)).hints).toEqual([
        'credit_dispute',
      ]);
    }
  });

  it('keeps the strongest rule when two rules give the same kind', () => {
    const result = classifyRecordFileThread(
      thread('Master ready', { name: 'Northside Mastering' })
    );
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.rule).toBe('sender_name.mastering');
  });
});

describe('parseSenderHeader', () => {
  it('keeps the display name and domain and drops the local part', () => {
    const parsed = parseSenderHeader(
      '"Northside Mastering" <noreply@Northside-Mastering.invalid>'
    );
    expect(parsed).toEqual({
      name: 'Northside Mastering',
      domain: 'northside-mastering.invalid',
    });
    expect(JSON.stringify(parsed)).not.toContain('noreply');
  });

  it('handles bare names, bare addresses and empty headers', () => {
    expect(parseSenderHeader('Ada Vale')).toEqual({
      name: 'Ada Vale',
      domain: null,
    });
    expect(parseSenderHeader('someone@lowtide.invalid')).toEqual({
      name: null,
      domain: 'lowtide.invalid',
    });
    expect(parseSenderHeader(undefined)).toEqual({ name: null, domain: null });
  });
});

describe('contractKey', () => {
  it('links a sent agreement with its signed copy', () => {
    expect(contractKey('Re: Fwd: Producer Agreement - signed copy')).toBe(
      contractKey('Producer Agreement')
    );
    expect(contractKey(null)).toBeNull();
  });
});

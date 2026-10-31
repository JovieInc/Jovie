# Decision default contract (`jovie.decision-default/v1`)

Status: Active
Owner: Summer (control loop `summerCardDefaults`)
Decision: `EVENT:` in [`canon/FLEET.md`](../../canon/FLEET.md#taste-never-blocks-default-plus-deadline), 2026-10-20

No founder ask waits forever. Every taste or decision ask carries a recommended
default and a deadline. At the deadline the default is recorded as the decision,
Summer acts on it, and Tim can still give post-ship feedback.

## Where asks reach Tim

| Path | Default + deadline today |
|---|---|
| Summer cards (`POST /api/internal/ovie/summer-cards`) | Yes: this contract. |
| Founder work orders (`jovie.work-order/v1` `founderAsk`) | Yes: `budget.deadline` becomes the card's `decideBy`; `founderAsk.defaultDecision` the card's `defaultDecision`. |
| Founder taste orders (`scripts/lib/founder-taste-order.mjs`) | Yes: 48 h, default `approve` ("Accept: the live build stays…"). |
| Design-lab proposals, certification inbox, visual QA drift, Linear `tim-action-required` | Not yet: shown with `decisionDefault: null` (JOV-8687). |
| PR labels | None: legacy human-hold labels are scrubbed (JOV-INV-028). |

## Card fields (Summer → Jovie)

| Field | Type | Meaning |
|---|---|---|
| `decideBy` | ISO 8601 with offset, optional | When the default applies. Omitted: 48 h after filing. Clamped to [filing time, filing + 14 days]. |
| `defaultDecision` | `approve` \| `reject`, optional | What the deadline records. Omitted: `reject` (no action). |
| `defaultIfSilent` | string ≤ 300 | Required when `defaultDecision` is set. Says what ships. |

Validation: `spend` and `outbound` cards are refused with `defaultDecision: approve`.
Cards that omit both new fields keep their payload digest, so replays filed
before the contract still match.

## Stored and returned card (Jovie → Summer, Ovie)

`SummerCard` gains:

| Field | Meaning |
|---|---|
| `decideBy` | Effective deadline. Legacy cards: `createdAt + 48h`. |
| `defaultDecision` | `approve` or `reject` (legacy: `reject`). |
| `resolution` | `founder`, `default`, or `null` while pending. |
| `feedback` | `[{ comment, at }]`, newest last, at most 20. |
| `feedbackAt` | Time of the latest feedback, or `null`. |

`status` keeps its values (`pending` / `approved` / `rejected`), so existing
consumers (work-order adapter, human-service receipts, Summer polling) keep
working. A default is recorded with `decidedBy: "default-on-expiry"`,
`resolution: "default"` and a comment naming the deadline and what shipped.

## Expiry

`/api/cron/frequent` sub-job `summerCardDefaults` runs every 15 minutes. It reads
up to 100 pending cards and moves each overdue one with the same compare-and-set
as a founder decision, so a founder decision that lands first always wins.

## Post-ship feedback hook

- Founder: `POST /api/ovie/summer-cards/{id}/feedback` `{ "comment": "…" }`
  (Summer-control authorization). 200 with the card; 409 `decide_first` while
  pending; 409 `busy_retry` after three lost races; 404 unknown card. The
  decision itself never changes.
- Summer: `GET /api/internal/ovie/summer-cards?status=decided&feedbackSince=<ISO>`
  returns cards with feedback at or after that time. Summer files the revision
  (JOV-8688).

## Ovie inbox data contract

`GET /api/ovie/inbox` cases (`OvieInboxCase`) gain `decisionDefault`:

```ts
interface InboxDecisionDefault {
  contract: 'jovie.decision-default/v1';
  decision: 'approve' | 'reject'; // recorded at the deadline
  summary: string;                // what ships if silent
  deadline: string;               // ISO; also set as the case's waitingUntil
  declared: boolean;              // false: legacy/undeclared, conservative default
}
```

`decisionDefault: null` means the source has no default yet (see the table
above). The Ovie UI owns presentation: show the default and the countdown, and
after a default lands, offer the feedback action against
`/api/ovie/summer-cards/{id}/feedback`.

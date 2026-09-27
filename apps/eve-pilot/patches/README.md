# Eve 0.63.0 compaction patch

Ported from summer-config#109. Eve's compaction tool-result cap re-truncates results it already
truncated: the `[Truncated by eve…]` marker plus 2,000 chars is itself over the 2,000-char limit.
Compaction leaves history just under the threshold, so the cap runs again on almost every step.
Each run nests another escaped copy and rewrites older messages, which invalidates the provider
prompt cache on every call. The patch makes `capToolResults` skip results that already carry the
marker.

`tests/prompt-prefix-stability.test.ts` re-compacts an already compacted history and requires every
earlier message to stay byte-identical. It fails on unpatched 0.63.0.

Ship now: this one-line patch. Re-evaluate when Eve is upgraded (the patch is pinned to 0.63.0, so
an upgrade fails install until it is re-ported or dropped). Then drop the patch once the stability
test passes on the unpatched version.

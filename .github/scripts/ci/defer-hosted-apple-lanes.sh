#!/usr/bin/env bash
set -euo pipefail
root="$RUNNER_TEMP/product-lane-classification"
# Only record ios/mac as queue-deferred when the classifier selected
# them. Unselected Apple lanes stay absent so post-queue main can tell
# deferral from "never touched Apple paths".
jq '
  .selectedLanes as $selected
  | .selectedLanes |= map(select(. != "ios" and . != "mac"))
  | .skippedLanes = (
      [.skippedLanes[] | select(.lane != "ios" and .lane != "mac")]
      + (
          ["ios", "mac"]
          | map(
              select(. as $lane | ($selected | index($lane)) != null)
              | {
                  lane: .,
                  reason: "merge queue does not wait on the hosted macOS pool"
                }
            )
        )
    )
  | .requiredGates |= del(.ios, .mac)
' "$root/receipt.json" > "$root/receipt.queue.json"
mv "$root/receipt.queue.json" "$root/receipt.json"

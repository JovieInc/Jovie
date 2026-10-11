# Eve compaction patch

Ship now: preserve already capped tool results during repeated compaction on
Eve 0.72.1. The regression uses the installed harness, appends an exchange,
and requires earlier messages to stay identical without a model call.

Re-evaluate when: the pinned Eve dependency changes or upstream fixes the cap.
Then: port and verify this exact patch, or remove it only when the regression
passes unpatched. Keep the patch and regression in both application exports.
The frozen install binds the patch to this version; this does not commission
or activate a runtime.

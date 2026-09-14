# Summer bounded-operator — E1 install (JOV-6163)

Close repair-to-runtime. Never claim E1 from `--self-test`/coalesce-skip. Never
weaken `maxAgeMs=600000`. Publisher code is on main (#17725); live Gem install is
external. If tip churn coalesces past Activate Gem **Install**, dispatch
publisher-only `gem-publisher-commission.yml` on `jovie-fixed` with
`tip_sha=<40-hex main tip>` + `confirm=install-jov-6163-publisher`. Download
`e1-publisher-commission-observations`, then:

```bash
node scripts/summer-commissioning/verify-e1-attestation-observations.mjs \
  --observation-a /path/a.json --observation-b /path/b.json
```

Exit 0 before `SUMMER_RUNNER_SOURCE_ATTESTATION_*`. Cursor/Fable: 403 on dispatch
(Tim/`actions:write`). MQ: jovie-bot only. Gates: `--check` 0 → align
`JOVIE_CONFIGURATION_SOURCE_REVISION` → install on `gem-service-attestation`
timer → two ≤600s observations → no `runner-source-attestation-unavailable` hold.


## Snapshot publisher and installer source

Gem's existing drain cycle invokes `scripts/symphony/summer_bottleneck_producer.py`.
The rehabilitation installer owns that publisher and its `summer_admissions.py`
and `summer_existing_repair.py` dependencies. Install them together from one
reviewed Jovie revision; installing only the service-attestation emitter does
not update the snapshot publisher. The Summer-config Python copy is not the
Gem installation source.

A fresh service attestation must produce the same runner revision in the actual
snapshot even when capacity evidence is unaccepted. Missing task/provider
observations stay unknown; aggregate capacity does not grant permission. Verify
the natural drain publication and Summer's returned decision after installation,
not just `emit-gem-service-attestation.py --check`. The CI publisher coverage gate
and installed-artifact regression protect this distinction.

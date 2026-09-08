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

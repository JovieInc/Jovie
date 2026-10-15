# LogYourBody native certification

JOV-6099 extends the JOV-5916 evidence lifecycle; it does not create a second test platform. The executable oracle is `scripts/lyb-native-certification.mjs`. A green workflow, Done issue, policy test, or uploaded-but-missing artifact is not a user-outcome receipt.

The route/state manifest from JOV-6095 supplies path IDs, exact XCTest identifiers, evidence tier, and required captures. JOV-6087 must map preview/export paths to screenshot and exported-image captures; JOV-6091 must map metric states to accessible, hittable action tests; JOV-6095 must map routes to mounted interactions rather than `GoldenPathTests` policy constants. Component/unit, simulator interaction, service integration, and physical-device paths remain separate.

## Launch scope binding (JOV-6013)

The current schema is `lyb-native-certification/v2`. Both input files use it;
legacy `v1` receipts cannot certify the new launch. The oracle always consumes
the checked-in [launch fixture](../../scripts/fixtures/lyb-launch-contract.json)
and [journey assertions](../product/lyb-launch-contract.md). No opt-in flag
can disable that reconciliation.

The manifest adds `launchContract` with:

- `schema`: the fixture's `schema` (`lyb-launch-contract/v1`).
- `digest`: SHA-256 of the exact fixture bytes, exported as
  `LAUNCH_CONTRACT_DIGEST` by `scripts/lyb-launch-contract.mjs`.
- `primarySurfaces`: the fixture's ordered three-surface list.
- `surfaces`: the complete sorted ID → disposition map, including tombstones.

The receipt adds `launchContractDigest` with the same digest and
`source.repository` equal to `JovieInc/LogYourBody`. The fixture's source SHA
pins the inventory audit only; `source.gitSha`, `source.mergedSha`, and
`build.installedGitSha` still identify the actual candidate under replay.

All 13 `requiredPaths` must occur exactly once in the manifest at the fixture's
evidence tier, with every required capture declared. The producer supplies
real XCTest identifiers for each path; this repository invents none. Existing
reconciliation checks their discovered, selected, executed, and passed records
and the hashed captures. Component-only policy tests cannot satisfy native
interaction or service-integration paths. Additional regression paths may be
included without authorizing additional product exposure.

The producer must reconcile current native screen registries, navigation,
sheets, and web pages against the inventory, including newly added surfaces.
Unknown IDs, changed dispositions, extra primary surfaces, missing paths,
weakened tiers/captures, or stale/missing policy digests fail closed as
`UNVERIFIED`. New surfaces require an explicit versioned contract revision.
LYB-183 owns this producer and app integration in the separate LYB repository.
The fixture is a policy expectation; passing synthetic oracle unit tests is
not installed-build, safety-model, or customer-journey proof.

## Current source audit and lifecycle replay

The 2026-09-27 `main` CI run [36293550868](https://github.com/JovieInc/LogYourBody/actions/runs/36293550868) is a real changed-path simulator run for merged SHA `2126a952395429fd6fd84797a5999b913142dc2b`. Artifact `ios-launch-quality-gate-36293550868` contains an xcresult, four passed UI records, device `iPhone 16` / iOS `26.2 (23C54)`, Xcode `26.3` (`17C529`), Swift language mode `5`, bundle `com.logyourbody.app`, version `1.2.0`, build `20251126162826`, and seven hashed screenshots including chat, onboarding, timeline, share, and analytics. The artifact did not emit the exact Swift compiler version, fixture hash/seed, or installed bundle identity, and its receipt explicitly records `exactDeployedBuild: not_verified`; therefore it is valid simulator evidence but **UNVERIFIED** for installed-build certification. This is the required fail-closed example, not a PASS.

The lifecycle is: CI artifact → exact merged SHA → identified installed bundle/version/build/SHA → changed-path replay → certification record. The oracle reconciles declared, discovered, selected, executed, passed, failed, and skipped counts and rejects zero tests, absent required cases/captures, missing xcresult hashes, wrong SHA/build/fixture/config, infrastructure skips, and flaky-only success. The deliberate negative-control test changes a required route record to `Failed` and proves the oracle blocks it.

LYB-19 is partly complete: selected `LogYourBodyUITests` cases run in the Launch Quality Gate, but `OnboardingGoldenPathUITests/testBodyScoreOnboardingGoldenPathReachesReveal()` was not among the four records in the audited artifact. JOV-4673 remains open only for exact installed/TestFlight build lineage and post-install replay; current simulator artifacts do not close it. Real TestFlight purchase/restore and affected physical-device performance are recorded as legitimate human-only candidate gates.

**Ship now:** fail-closed receipt reconciliation and explicit evidence tiers. **Re-evaluate when:** LogYourBody emits the JOV-6095 manifest and installed-build identity. **Then:** feed both JSON files to the existing oracle and promote only affected paths whose required records pass; reuse unaffected receipts only when source dependency, toolchain, configuration, fixture, and build fingerprints still match.

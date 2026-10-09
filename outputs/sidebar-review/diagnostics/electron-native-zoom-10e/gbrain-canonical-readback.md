---
type: concept
title: Shared sidebar native zoom and drawer focus repaired at f4a73e59
date: '2026-10-08T00:00:00.000Z'
tags:
  - electron
  - jovie
  - runtime-proof
  - sidebar
---

## Current source and ownership
Sole writer remains Polish the shared sidebar, chat01a118b8-6fe1-7622-8ce0-57066fea7086; no Linear issue — ad-hoc, coder. Current local HEADf4a73e59c09c62f349195c486419b2278df79b9b/treeba71eaede1e5643fa137265387bdbd6ff43d39e1 oncodex/shared-sidebar-browser-proof. Two normal-hook commits:278700c006d648ca4f03c08abffb4087d838f4a2 repairs compact drawer focus;f4a73e59 repairs native zoom geometry. Five source files; all tested SHA256s still match committed files. No push, PR, publication, external message or remote job dispatch. Native545b383925854b8a1632fffe9b48087fe88f6e37 unchanged.

## Reproduced defects and bounded repairs
The design-owner audit correctly identified a missing containment assertion in earlier10e native zoom records. Actual hidden Electron44.5.1/Chromium152.0.7977.130 atzoom2 reported native overlay22CSSpx/application row22, brand/toggle y=-3 and history buttons y=-1. The new native containment probe failed; both new maintained CI regressions also failed on22px height. This supersedes the zoom-acceptance implication in [[receipts/shared-sidebar-native-titlebar-10e76a95-2026-10-08]]; its desktop overlap correction and historical artifacts remain valid.

CSS now separates raw native height env(titlebar-area-height,44px) from application row max(44px,var(--electron-native-titlebar-height)). At200% native overlay remains22 but application row44 and28px brand/toggle starty8, fully contained. At80% both native/application row55; no shrinking of text/targets or native OS control changes. Existing clearance+162px width and shrink-0 remain.

New keyboard regression found compact drawer Escape returned focus tobody because modal has no Radix Trigger. Shared Sidebar now captures its origin before autofocus and restores only abandoned focus on close using existing availability helper; live route/editor/palette focus is retained. Real unit tests exercise keyboard return and a live editor handoff; existing phone Find-a-page palette case remains passing. No generic overlay framework or auth/backend edits.

## Current local execution and scope
Maintainedplaywright.config.storybook.ts shared+canonical sidebar selectors:29passed,0skipped/0flaky/0fail,39.854458sec. Two new geometry/focus CI cases cover raw native heights22/44/55 and keyboard drawer open/Escape; native actual bounds are independently measured.
Realvitest.config.ci.mts four affected selectors:57passed;V8lines92/96=95.83%,branches159/171=92.98%,functions16/18=88.88%;thresholds unchanged. CSS is not V8-instrumentable; actual browser/native geometry and state checks cover that behavior. Desktop shell contracts28/28; maintained web typecheck exit0. Normal ESLint/Biome/secrets/stageda11y hooks passed.
Strengthened real hidden Electron fixture matrix14/14 covers both navigation identities, light/dark and1024/1440/1920 desktop plusnative200% compact view; control top/bottom/native-reserve bounds are now asserted. Four additional actual200%/80% cases pass individual brand/toggle/back/forward containment. A first80% probe hit0.001953125px size rounding; final size check uses0.05px tolerance, containment remains strict. Desktop matrix explicitly resetszoom1 after previous80% probe to avoid fixture-profile state contamination.

These are hidden, unfocused unpackaged fixture/development renderer6017 results using existing cached runtime, maintained isolated preload/native options, temporary profile and loopback-only requests. Full main auth/updater lifecycle is not booted. SyntheticHome/Yourworkspace screenshots demonstrate geometry only, not authenticated workspace or founder-review-ready product. ActualOSdrag, installed signed app, physical120Hz/humanVoiceOver, protectednativeOvie/privateSummer history/resume, production/currentcombinedCI, hosted merge/deploy/persistence acceptance remain open. Original full goal stays active; current turn made concrete progress.

## Dependency and next admission
Existing resource owner normal qualification owner-normal-PR20988-14a-paired-20261008T0937Z at14a3fe807b7605edd11348165e999b1ef32618f4 exited0 at2026-10-08T10:11:34.583337Z. Actual copied receipt SHA256bbd5d1f3767e26012c3eee2cd406e3e7c79d77aa51712252c09d5638d6d9324d confirms owned command drain and seat release, aggregate peakRSS6115422208bytes.14a main.ts/lifecycle blobs match prepared16a exactly; only production-react-resolution test differs. This is compiler dependency proof, not sidebar qualification.

New immutable current input prepared atdiagnostics/gem-production-request-f4a73e59/request.json SHA256a273598b2aa46817b169314dd26c87ac0338c156ff665498d40f65c08b9d6b06, exactHEAD git archive84,458,598bytes,10verifiedpayloads,qualified14a compiler bytes/currenthead runners. Prepared only; not sent/transferred/admitted/executed. Earlier245/10e inputs remain immutable historical evidence. Existing owner must reconcile qualified source/supervisor/seat before admitting another job; no authority to message that chat or dispatch a job is inferred.

Local maintained build gate at2026-10-08T10:21:58.691Z rejected host-memory-reserve:total34359738368,available1655226368,reserve10307921511,ownedheadroom8589934592bytes. No build started, gate unchanged. Scoped read-only devicectl inventory succeeded outside sandbox: one paired iPhone, iOS27,developerModeenabled,tunnel unavailable,lastconnectedOct1. Initial sandbox XPC failure was not evidence of no devices. No pairing/unlock/install/launch/recovery action performed.

Ship now: retain bounded local corrections and exact evidence. Re-evaluate when: authorized resource-owner current-head admission and native-session/physical/installed prerequisites become available. Then: complete original full runtime, persistence and performance acceptance.

## Artifacts and cleanup
outputs/sidebar-review/diagnostics/electron-native-zoom-10e/{receipt.json,README.md,current-full-report.json,final-coverage,current-native-flow-cases.json,green-cases.json,red-cases.json,tested-source-sha256.json,cleanup.json,hashes.json};52artifact hashes verified. All owned probes terminal/contexts closed; read-only executable-prefix census found0ownedElectron survivors. Existing6017 preserved;installed apps/personal sessions/native simulator untouched. Requirement audit/qualification/branch metadata updated tocurrenthead while keeping prior245/10e proofs historical.


---
paths: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "**/*.cjs"]
---

# Anti-slop ratchets

CI (`ci-slop-guard`, required through PR Ready) runs `JovieInc/ci/actions/slop-guard`; policy lives in JovieInc/ci, this repo owns only the shrink-only `config/slop-guard/baseline.json`. Fix the offender; never add to the baseline.

- Size: no new source file over 500 lines (tests 1000); a baselined file may not grow.
- Pass-through: no file that only re-exports or forwards to one call; real boundaries carry `// boundary: <reason>`.
- Single implementation: no interface or abstract class with one implementation and no test double.
- Dead code: knip reports no new unused file, export or type.
- Duplication: jscpd reports no new duplicated block.
- Prefix sprawl: no directory with more than 8 files sharing a `prefix-`.

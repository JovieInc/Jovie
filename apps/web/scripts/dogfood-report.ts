import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type DogfoodCounts,
  type DogfoodSample,
  reportDogfood,
} from './dogfood-scanners';

// Local fixture runner only. No CI registration, browser login, or account writes.
const fixturePath =
  process.argv[2] ??
  fileURLToPath(new URL('./dogfood-fixtures.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  provenance: string;
  samples: DogfoodSample[];
  baseline: DogfoodCounts;
};
console.log(
  JSON.stringify(
    {
      provenance: fixture.provenance,
      ...reportDogfood(fixture.samples, fixture.baseline),
    },
    null,
    2
  )
);
// Findings, including regressions, never set a failing process exit code.

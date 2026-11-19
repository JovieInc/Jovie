# Independent data-lane observations

Observed November 17, 2026. This report separates source delivery, local check execution and verified live outcomes for research, copywriting, strategy and ordinary documentation work.

The publication-recovery guide ([#25844](https://github.com/JovieInc/Jovie/pull/25844)) and independent reasoning/publication changes ([#25847](https://github.com/JovieInc/Jovie/pull/25847)) merged through the native code lane. Contract-discovery optimization ([#25846](https://github.com/JovieInc/Jovie/pull/25846)) also merged. These are source-delivery results; they do not establish live worker acceptance or completed content publication.

| Observation | Sample | Measured time |
| --- | --- | --- |
| Historical gardening/control checks | Two real merged PRs | 331–332 seconds of contract execution |
| Hosted start wait for that control cohort | Same two PRs | 13–129 seconds |
| Ordinary-prose checker on exact local fixture revisions | Three successful repetitions | p50 2.945 seconds; p95 2.987 seconds |
| Separate local archive/classification bootstrap | Same three repetitions | p50 2.148 seconds; p95 2.387 seconds |

The historical samples ([#24549](https://github.com/JovieInc/Jovie/pull/24549), [#24902](https://github.com/JovieInc/Jovie/pull/24902)) update machine-consumed gardening markers. They are a control cohort, not an ordinary-prose baseline. The local samples are synthetic timing probes. These different workloads cannot establish a matched before/after improvement or hosted publication latency.

Local checker execution exceeded the one-to-two-second target. A separate profile measured 1.395 seconds in exact-range classification and consumer discovery, and 0.705 seconds in document-freshness validation. Queue time is excluded from those execution measurements.

Live evidence remains incomplete: accepted native workers completing independent research concurrently during code congestion, and authorized content progressing through preview, publication, served-result verification and rollback, remain unverified. No hosted ordinary-prose after measurement or matched end-to-end publication comparison is established.

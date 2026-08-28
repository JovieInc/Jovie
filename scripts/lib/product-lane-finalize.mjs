import { readFileSync, writeFileSync } from 'node:fs';
import { evaluateProductLaneResults } from './product-lane-classifier.mjs';

const [receiptPath, resultsPath, jsonPath, summaryPath] = process.argv.slice(2);
if (![receiptPath, resultsPath, jsonPath, summaryPath].every(Boolean)) {
  throw new Error(
    'Usage: product-lane-finalize <receipt> <results> <json> <summary>'
  );
}

const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
const evaluation = evaluateProductLaneResults(receipt, results.lanes);
const finalReceipt = {
  ...receipt,
  actualResults: results,
  ...evaluation,
};
writeFileSync(jsonPath, `${JSON.stringify(finalReceipt, null, 2)}\n`);
writeFileSync(
  summaryPath,
  [
    '### Final product-lane receipt',
    '',
    `- SHA: \`${receipt.provenance.sha}\``,
    `- Selected lanes: ${receipt.selectedLanes.join(', ') || 'none'}`,
    `- Independently shippable products: ${evaluation.independentlyShippableProducts.join(', ') || 'none'}`,
    `- Aggregate admission: ${evaluation.aggregatePassed ? 'passed' : 'failed'}`,
    `- Receipt artifact: \`${results.receiptArtifact}\``,
    '',
    '| Lane | Selected | Passed | Exact results |',
    '| --- | --- | --- | --- |',
    ...Object.entries(evaluation.admissions).map(
      ([lane, admission]) =>
        `| ${lane} | ${admission.selected} | ${admission.passed} | ${admission.results.join(', ') || 'none'} |`
    ),
    '',
  ].join('\n')
);
if (!evaluation.aggregatePassed) process.exitCode = 1;

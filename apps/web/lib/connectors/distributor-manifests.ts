import type { FileImportConnectorDefinition } from './file-import-contract';
import type { DistributorId } from './types';

function manifest(
  id: DistributorId,
  label: string,
  documentationUrl: string,
  format: 'csv' | 'pdf' | 'unknown',
  granularity: 'statement_line' | 'statement_summary' | 'unknown',
  documented = true
): FileImportConnectorDefinition {
  return {
    id,
    label,
    transport: 'file_import',
    approval: {
      status: 'approved',
      scope: 'account_holder_supplied_files',
      evidenceRef: 'https://linear.app/jovie/issue/JOV-8430',
      requiresPerImportReceipt: true,
    },
    reports: [
      {
        documentationUrl,
        documentationStatus: documented ? 'documented' : 'unverified',
        format,
        // No vendor version or parser read receipt has been supplied.
        formatVersion: { status: 'unknown' },
        granularity,
      },
    ],
    capabilities: [
      {
        id: 'catalog.import',
        availability: 'unavailable',
        reason: 'No catalog parser and successful read receipt verified.',
      },
      {
        id: 'statements.import',
        availability: 'unavailable',
        reason: 'No statement parser and successful read receipt verified.',
      },
      {
        id: 'payouts.import',
        availability: 'unavailable',
        reason: 'No payout parser and successful read receipt verified.',
      },
    ],
    automatedAccess: {
      availability: 'unavailable',
      reason:
        'Official API documentation, approved scopes, credentials, and a successful read receipt are all required.',
    },
  };
}

/** Official export guidance is evidence of a file, not API or terms approval. */
export const DISTRIBUTOR_MANIFESTS = {
  awal: manifest(
    'awal',
    'AWAL',
    'https://help.awal.com/hc/en-us/articles/33485262750099',
    'unknown',
    'unknown',
    false
  ),
  cdbaby: manifest(
    'cdbaby',
    'CD Baby',
    'https://support.cdbaby.com/hc/en-us/articles/37032034337421',
    'unknown',
    'statement_summary'
  ),
  distrokid: manifest(
    'distrokid',
    'DistroKid',
    'https://support.distrokid.com/hc/en-us/articles/360013648253',
    'csv',
    'statement_line'
  ),
  routenote: manifest(
    'routenote',
    'RouteNote',
    'https://support.routenote.com/kb-article/where-can-i-find-my-reports/',
    'unknown',
    'statement_line'
  ),
  symphonic: manifest(
    'symphonic',
    'Symphonic',
    'https://support.symdistro.com/hc/en-us/articles/211678046-Understanding-your-Earnings-Detail-CSV-Export',
    'csv',
    'statement_line'
  ),
  tunecore: manifest(
    'tunecore',
    'TuneCore',
    'https://support.tunecore.com/hc/en-in/articles/115006684868',
    'csv',
    'statement_line'
  ),
  unitedmasters: manifest(
    'unitedmasters',
    'UnitedMasters',
    'https://support.unitedmasters.com/hc/en-us/articles/11982416053907',
    'pdf',
    'statement_summary'
  ),
} as const satisfies Record<DistributorId, FileImportConnectorDefinition>;

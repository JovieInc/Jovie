'use client';

import { ExportCSVButton } from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  getReleasesForExport,
  RELEASES_CSV_COLUMNS,
} from './utils/exportReleases';

interface ReleaseTableExportButtonProps {
  readonly releases: ReleaseViewModel[];
  readonly selectedIds: Set<string>;
}

export function ReleaseTableExportButton({
  releases,
  selectedIds,
}: ReleaseTableExportButtonProps) {
  return (
    <ExportCSVButton
      getData={() => getReleasesForExport(releases, selectedIds)}
      columns={RELEASES_CSV_COLUMNS}
      filename='releases'
      label='Export'
      variant='ghost'
      size='sm'
      chrome='page-toolbar'
      iconOnly
      tooltipLabel='Export'
      className='h-7 w-7 rounded-full px-0 [&_svg]:h-3 [&_svg]:w-3'
    />
  );
}

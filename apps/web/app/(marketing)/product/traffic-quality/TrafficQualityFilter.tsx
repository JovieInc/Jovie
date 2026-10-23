'use client';

import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { TRAFFIC_QUALITY_COPY } from '@/data/trafficQualityCopy';

/** Live settings row. Starts on so the page shows High quality only. */
export function TrafficQualityFilter() {
  const [excludeSelf, setExcludeSelf] = useState(true);
  const { title, highQuality, allTraffic, ariaLabel } =
    TRAFFIC_QUALITY_COPY.filter;

  return (
    <div data-testid='traffic-quality-filter'>
      <SettingsToggleRow
        icon={<BarChart3 className='h-4 w-4' aria-hidden />}
        title={title}
        description={excludeSelf ? highQuality : allTraffic}
        checked={excludeSelf}
        onCheckedChange={setExcludeSelf}
        ariaLabel={ariaLabel}
      />
    </div>
  );
}

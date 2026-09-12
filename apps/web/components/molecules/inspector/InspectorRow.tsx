'use client';

import {
  DrawerPropertyRow,
  type DrawerPropertyRowProps,
} from '@/components/molecules/drawer/DrawerPropertyRow';

export type InspectorRowProps = DrawerPropertyRowProps;

const INSPECTOR_LABEL_WIDTH = 96;

/**
 * Standardized Inspector fact row. Optical 96px label column matches
 * Library System B metadata grid.
 */
export function InspectorRow({
  labelWidth = INSPECTOR_LABEL_WIDTH,
  size = 'sm',
  ...props
}: InspectorRowProps) {
  return <DrawerPropertyRow labelWidth={labelWidth} size={size} {...props} />;
}

import { NativeSelect, type NativeSelectProps } from '@jovie/ui';
import { forwardRef } from 'react';

export const Select = forwardRef<HTMLSelectElement, NativeSelectProps>(
  (props, ref) => <NativeSelect ref={ref} {...props} />
);

Select.displayName = 'Select';

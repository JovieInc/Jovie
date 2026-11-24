'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageToolbarSelect } from '@/components/organisms/table/molecules/PageToolbarSelect';
import {
  PRIMARY_TAB_RESET_KEYS,
  type WorkspaceTabOption,
} from '@/components/organisms/WorkspaceTabsSurface';

interface AdminQueryTabsSelectProps<T extends string> {
  readonly param: string;
  readonly value: T;
  readonly options: readonly WorkspaceTabOption<T>[];
  readonly clearOnChange?: readonly string[];
}

export function AdminQueryTabsSelect<T extends string>({
  param,
  value,
  options,
  clearOnChange = [],
}: AdminQueryTabsSelectProps<T>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  return (
    <PageToolbarSelect
      label='View'
      value={value}
      options={options.map(option => ({
        value: option.value,
        label: option.label,
      }))}
      onValueChange={next => {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set(param, next);
        for (const key of [...PRIMARY_TAB_RESET_KEYS, ...clearOnChange]) {
          nextParams.delete(key);
        }
        const query = nextParams.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
    />
  );
}

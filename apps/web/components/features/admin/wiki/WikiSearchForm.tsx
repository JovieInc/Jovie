import { Input } from '@jovie/ui';

interface Props {
  initialQuery?: string;
}

export function WikiSearchForm({ initialQuery }: Props) {
  return (
    <form action='/hud/wiki' method='GET' className='mb-6'>
      <Input
        type='search'
        name='q'
        aria-label='Search wiki'
        defaultValue={initialQuery || ''}
        placeholder='Search wiki...'
      />
    </form>
  );
}

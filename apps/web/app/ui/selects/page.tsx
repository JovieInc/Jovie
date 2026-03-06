import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2
        className='mb-4 text-[11px] font-semibold uppercase tracking-wider text-(--linear-text-tertiary)'
      >
        {title}
      </h2>
      <div className='flex flex-wrap items-start gap-6'>{children}</div>
    </div>
  );
}

function Stack({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <span className='text-[11px] text-(--linear-text-tertiary)'>{title}</span>
      {children}
    </div>
  );
}

export default function SelectsPage() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-(--linear-text-primary)'>
        Select
      </h1>
      <p className='mb-8 text-[13px] text-(--linear-text-tertiary)'>
        Matches Linear.app — 32px trigger height, 6px radius, shared dropdown
        content styles
      </p>

      {/* Default */}
      <Section title='Default'>
        <Stack title='placeholder'>
          <Select>
            <SelectTrigger className='w-64'>
              <SelectValue placeholder='Select an option' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='option-1'>Option 1</SelectItem>
              <SelectItem value='option-2'>Option 2</SelectItem>
              <SelectItem value='option-3'>Option 3</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
        <Stack title='with value'>
          <Select defaultValue='option-2'>
            <SelectTrigger className='w-64'>
              <SelectValue placeholder='Select an option' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='option-1'>Option 1</SelectItem>
              <SelectItem value='option-2'>Option 2</SelectItem>
              <SelectItem value='option-3'>Option 3</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
        <Stack title='disabled'>
          <Select disabled>
            <SelectTrigger className='w-64'>
              <SelectValue placeholder='Select an option' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='option-1'>Option 1</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
      </Section>

      {/* With Groups */}
      <Section title='With Groups'>
        <Stack title='grouped items'>
          <Select>
            <SelectTrigger className='w-64'>
              <SelectValue placeholder='Select a fruit' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Fruits</SelectLabel>
                <SelectItem value='apple'>Apple</SelectItem>
                <SelectItem value='banana'>Banana</SelectItem>
                <SelectItem value='orange'>Orange</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Vegetables</SelectLabel>
                <SelectItem value='carrot'>Carrot</SelectItem>
                <SelectItem value='celery'>Celery</SelectItem>
                <SelectItem value='broccoli'>Broccoli</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Stack>
      </Section>

      {/* Widths */}
      <Section title='Widths'>
        <Stack title='w-40'>
          <Select>
            <SelectTrigger className='w-40'>
              <SelectValue placeholder='Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='active'>Active</SelectItem>
              <SelectItem value='inactive'>Inactive</SelectItem>
              <SelectItem value='pending'>Pending</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
        <Stack title='w-64'>
          <Select>
            <SelectTrigger className='w-64'>
              <SelectValue placeholder='Select an option' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='option-1'>Option 1</SelectItem>
              <SelectItem value='option-2'>Option 2</SelectItem>
              <SelectItem value='option-3'>Option 3</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
      </Section>

      {/* In Context */}
      <Section title='In Context (with labels)'>
        <Stack title='Assignee'>
          <p
            id='label-assignee'
            className='text-[13px] font-[450] text-(--linear-text-primary)'
          >
            Assignee
          </p>
          <Select>
            <SelectTrigger className='w-64' aria-labelledby='label-assignee'>
              <SelectValue placeholder='Select assignee' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='alice'>Alice</SelectItem>
              <SelectItem value='bob'>Bob</SelectItem>
              <SelectItem value='charlie'>Charlie</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
        <Stack title='Priority'>
          <p
            id='label-priority'
            className='text-[13px] font-[450] text-(--linear-text-primary)'
          >
            Priority
          </p>
          <Select defaultValue='medium'>
            <SelectTrigger className='w-40' aria-labelledby='label-priority'>
              <SelectValue placeholder='Priority' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='urgent'>Urgent</SelectItem>
              <SelectItem value='high'>High</SelectItem>
              <SelectItem value='medium'>Medium</SelectItem>
              <SelectItem value='low'>Low</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
        <Stack title='Status'>
          <p
            id='label-status'
            className='text-[13px] font-[450] text-(--linear-text-primary)'
          >
            Status
          </p>
          <Select defaultValue='in-progress'>
            <SelectTrigger className='w-40' aria-labelledby='label-status'>
              <SelectValue placeholder='Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='backlog'>Backlog</SelectItem>
              <SelectItem value='todo'>Todo</SelectItem>
              <SelectItem value='in-progress'>In Progress</SelectItem>
              <SelectItem value='done'>Done</SelectItem>
              <SelectItem value='cancelled'>Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
      </Section>
    </div>
  );
}

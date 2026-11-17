import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  CONTENT_TABLE_CELL_CLASS,
  CONTENT_TABLE_HEAD_CELL_CLASS,
  CONTENT_TABLE_HEAD_ROW_CLASS,
  CONTENT_TABLE_ROW_CLASS,
  ContentTable,
} from './ContentTable';

type Row = { readonly name: string; readonly email?: string };

function ContactsTable({
  rows,
  label = 'Contacts',
  nameHeader = 'Name',
  emailHeader = 'Email',
}: {
  readonly rows: readonly Row[];
  readonly label?: string;
  readonly nameHeader?: string;
  readonly emailHeader?: string;
}) {
  return (
    <ContentTable aria-label={label}>
      <thead>
        <tr className={CONTENT_TABLE_HEAD_ROW_CLASS}>
          <th scope='col' className={CONTENT_TABLE_HEAD_CELL_CLASS}>
            {nameHeader}
          </th>
          <th scope='col' className={CONTENT_TABLE_HEAD_CELL_CLASS}>
            {emailHeader}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.name} className={CONTENT_TABLE_ROW_CLASS}>
            <td className={CONTENT_TABLE_CELL_CLASS}>{row.name}</td>
            <td className={CONTENT_TABLE_CELL_CLASS}>{row.email ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </ContentTable>
  );
}

/** Rendered states of the content table, beside ContentTable.stories.tsx. */
const meta: Meta<typeof ContentTable> = {
  title: 'Molecules/ContentTable States',
  component: ContentTable,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof ContentTable>;

/** Partial: some contacts have no email yet, shown as a dash. */
export const PartialMissingEmails: Story = {
  render: () => (
    <ContactsTable
      rows={[
        { name: 'Avery Chen', email: 'avery@example.com' },
        { name: 'Jordan Lee' },
        { name: 'Sam Rivera' },
      ]}
    />
  ),
};

/** Long content: many rows and a long address that scrolls inside the wrapper. */
export const ManyRowsLongValues: Story = {
  render: () => (
    <div className='w-96'>
      <ContactsTable
        rows={Array.from({ length: 14 }, (_, index) => ({
          name: `Contact ${index + 1}`,
          email:
            index === 0
              ? 'booking-and-management-team-for-every-territory@example-label.com'
              : `contact${index + 1}@example.com`,
        }))}
      />
    </div>
  ),
};

/** Right-to-left: Arabic headers and rows on a right-to-left page. */
export const RtlArabicTable: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <ContactsTable
        label='جهات الاتصال'
        nameHeader='الاسم'
        emailHeader='البريد الإلكتروني'
        rows={[
          { name: 'فيروز', email: 'fairuz@example.com' },
          { name: 'عمرو دياب' },
        ]}
      />
    </div>
  ),
};

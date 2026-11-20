import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContentTable, ContentTableStateRow } from './ContentTable';

const CONTACT_NUMBERS = Array.from({ length: 12 }, (_, index) => index + 1);

function Table({ children }: { readonly children: React.ReactNode }) {
  return (
    <ContentTable aria-label='Contacts' wrapperClassName='max-w-md'>
      <thead>
        <tr>
          <th scope='col'>Name</th>
          <th scope='col'>Email</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </ContentTable>
  );
}

describe('ContentTable certificate', () => {
  it('announces the loading row with its label', async () => {
    const { container } = render(
      <Table>
        <ContentTableStateRow
          colSpan={2}
          isLoading
          emptyMessage='No contacts yet'
          loadingLabel='Loading contacts'
        />
      </Table>
    );

    const status = container.querySelector('output') as HTMLOutputElement;
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading contacts');
    expect(screen.queryByText('No contacts yet')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('spans the empty message across every column', async () => {
    const { container } = render(
      <Table>
        <ContentTableStateRow colSpan={2} emptyMessage='No contacts yet' />
      </Table>
    );

    const cell = screen.getByRole('cell', { name: 'No contacts yet' });
    expect(cell).toHaveAttribute('colspan', '2');
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveClass(
      'overflow-x-auto',
      'max-w-md'
    );
    await expectNoA11yViolations(container);
  });

  it('renders partial, long and RTL rows axe-clean', async () => {
    const { container } = render(
      <div>
        <Table>
          <tr>
            <td>Jordan Lee</td>
            <td>—</td>
          </tr>
          {CONTACT_NUMBERS.map(number => (
            <tr key={number}>
              <td>{`Contact ${number}`}</td>
              <td>{`contact${number}@example.com`}</td>
            </tr>
          ))}
        </Table>
        <div dir='rtl' lang='ar'>
          <ContentTable aria-label='جهات الاتصال'>
            <tbody>
              <tr>
                <td>فيروز</td>
              </tr>
            </tbody>
          </ContentTable>
        </div>
      </div>
    );

    const contacts = screen.getByRole('table', { name: 'Contacts' });
    expect(within(contacts).getAllByRole('row')).toHaveLength(14);
    expect(
      screen.getByRole('table', { name: 'جهات الاتصال' })
    ).toHaveTextContent('فيروز');
    await expectNoA11yViolations(container);
  });
});

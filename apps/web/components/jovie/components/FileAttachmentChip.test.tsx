import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FileAttachmentChip } from './FileAttachmentChip';

describe('FileAttachmentChip', () => {
  it('opens a named document in a new tab from pointer and keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FileAttachmentChip
        url='https://files.example.com/uploads/press-kit.pdf'
        name='press-kit.pdf'
        mediaType='application/pdf'
      />
    );

    const link = screen.getByRole('link', {
      name: 'File attachment: press-kit.pdf',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://files.example.com/uploads/press-kit.pdf'
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(
      container.querySelector('.system-b-file-attachment-icon')
    ).toHaveAttribute('data-kind', 'document');
    expect(screen.getByTestId('file-attachment-chip')).toHaveClass(
      'system-b-image-attachment-chip-light'
    );

    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('derives the label and kind from the URL when name and type are missing', async () => {
    const { container } = render(
      <FileAttachmentChip url='https://files.example.com/uploads/Midnight%20Drive%20master.wav?sig=abc' />
    );

    expect(
      screen.getByRole('link', {
        name: 'File attachment: Midnight Drive master.wav',
      })
    ).toBeInTheDocument();
    expect(
      container.querySelector('.system-b-file-attachment-icon')
    ).toHaveAttribute('data-kind', 'audio');
    await expectNoA11yViolations(container);
  });

  it('middle-ellipsizes long names and keeps right-to-left names whole', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <FileAttachmentChip
          url='https://files.example.com/uploads/brief.docx'
          name='Midnight Drive deluxe anniversary edition marketing brief final v12.docx'
          tone='onDark'
        />
        <FileAttachmentChip
          url='https://files.example.com/uploads/lyrics.txt'
          name='كلمات الأغنية.txt'
          mediaType='text/plain'
        />
      </div>
    );

    const [longLink] = screen.getAllByRole('link');
    expect(longLink.getAttribute('aria-label')).toMatch(
      /^File attachment: Midnight Drive.+….+v12\.docx$/
    );
    expect(
      screen.getByRole('link', { name: 'File attachment: كلمات الأغنية.txt' })
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('file-attachment-chip')[0]).toHaveClass(
      'system-b-image-attachment-chip-dark'
    );
    await expectNoA11yViolations(container);
  });
});

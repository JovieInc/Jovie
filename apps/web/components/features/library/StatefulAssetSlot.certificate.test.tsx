import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StatefulAssetSlot } from './StatefulAssetSlot';

vi.unmock('next/image');

const baseSlot = {
  cardinality: 'single' as const,
  acquireMode: 'file' as const,
  testIdPrefix: 'library-artwork',
  objectTitle: 'Artwork',
  acquireLabel: 'Drop artwork',
  accept: 'image/jpeg',
};

describe('StatefulAssetSlot certificate', () => {
  it('uploads a picked file from the empty drop zone and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    const { container } = render(
      <StatefulAssetSlot
        kind='artwork'
        occupancy='empty'
        {...baseSlot}
        acquireHint='JPG, at least 3000 by 3000'
        onFile={onFile}
      />
    );

    const input = screen.getByLabelText('Drop artwork');
    expect(input).toHaveClass('sr-only');
    expect(input).toHaveAttribute('accept', 'image/jpeg');
    expect(screen.getByText('JPG, at least 3000 by 3000')).toBeInTheDocument();

    const file = new File(['art'], 'cover.jpg', { type: 'image/jpeg' });
    await user.upload(input as HTMLInputElement, file);
    expect(onFile).toHaveBeenCalledWith(file);
    expect((input as HTMLInputElement).value).toBe('');
    await expectNoA11yViolations(container);
  });

  it('reserves the preview size and replaces the file from the populated slot', async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    const { container } = render(
      <StatefulAssetSlot
        kind='artwork'
        occupancy='populated'
        {...baseSlot}
        objectSubtitle='3000 by 3000 JPG'
        previewSrc='https://cdn.example.com/art.jpg'
        onFile={onFile}
      />
    );

    const preview = container.querySelector('img');
    expect(preview).toHaveAttribute('src', 'https://cdn.example.com/art.jpg');
    expect(preview).toHaveAttribute('width', '32');
    expect(preview).toHaveAttribute('height', '32');
    expect(screen.getByText('3000 by 3000 JPG')).toBeInTheDocument();

    const file = new File(['art'], 'new-cover.jpg', { type: 'image/jpeg' });
    await user.upload(
      screen.getByLabelText('Replace') as HTMLInputElement,
      file
    );
    expect(onFile).toHaveBeenCalledWith(file);
    await expectNoA11yViolations(container);
  });

  it('keeps the disabled drop zone and its input inert', async () => {
    const onFile = vi.fn();
    const { container } = render(
      <StatefulAssetSlot
        kind='artwork'
        occupancy='empty'
        {...baseSlot}
        disabled
        onFile={onFile}
      />
    );

    expect(
      screen.getByTestId('library-artwork-dropzone-button')
    ).toBeDisabled();
    expect(screen.getByLabelText('Drop artwork')).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('truncates a long title and stays axe-clean right to left', async () => {
    const title =
      'ملف العمل الفني النهائي لإصدار منتصف الليل بجميع المقاسات والنسخ المعتمدة';
    const { container } = render(
      <div dir='rtl' lang='ar' className='w-64'>
        <StatefulAssetSlot
          kind='docs'
          occupancy='populated'
          {...baseSlot}
          objectTitle={title}
          onFile={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText(title)).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});

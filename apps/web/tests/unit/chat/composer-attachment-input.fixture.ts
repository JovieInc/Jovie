import { fireEvent, screen } from '@testing-library/react';

export function enterComposerScreenshot(
  entry: 'drop' | 'paste' | 'picker change',
  input: HTMLElement
) {
  const screenshot = new File(['fixture'], 'screenshot.png', {
    type: 'image/png',
  });
  if (entry === 'drop') {
    fireEvent.drop(screen.getByTestId('chat-workspace'), {
      dataTransfer: { files: [screenshot] },
    });
  } else if (entry === 'paste') {
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'file', getAsFile: () => screenshot }],
      },
    });
  } else {
    const picker = screen
      .getByTestId('chat-content')
      .querySelector('input[type=file]');
    if (!picker) throw new Error('Missing file input');
    fireEvent.change(picker, { target: { files: [screenshot] } });
  }
}

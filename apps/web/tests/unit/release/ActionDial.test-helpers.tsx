import { fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { vi } from 'vitest';
import {
  ActionDial,
  type ActionDialOption,
} from '@/components/features/release/ActionDial';

export const ACTION_DIAL_OPTIONS: ActionDialOption[] = [
  {
    id: 'spotify',
    label: 'Spotify',
    href: 'https://open.spotify.com/song',
    icon: <span>Spotify icon</span>,
  },
  {
    id: 'apple',
    label: 'Apple Music',
    href: 'https://music.apple.com/song',
    icon: <span>Apple icon</span>,
  },
  {
    id: 'deezer',
    label: 'Deezer',
    href: 'https://deezer.com/song',
    icon: <span>Deezer icon</span>,
  },
];

export const ACTION_DIAL_MANY: ActionDialOption[] = Array.from(
  { length: 100 },
  (_, i) => ({
    id: `d${i + 1}`,
    label: `Dest ${String(i + 1).padStart(3, '0')}`,
    href: `https://example.com/${i + 1}`,
    icon: <span>icon {i + 1}</span>,
  })
);

export function actionDialTouch(
  target: Element,
  type: string,
  clientY: number,
  timeStamp: number
) {
  const event = new MouseEvent(type, { bubbles: true, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
    // React treats a 0 timeStamp as missing, so offset the fake clock.
    timeStamp: { value: timeStamp + 1000 },
  });
  fireEvent(target, event);
}

export function ActionDialFixture({
  options = ACTION_DIAL_OPTIONS,
  onSelect = vi.fn(),
  onActivate,
}: {
  readonly options?: ActionDialOption[];
  readonly onSelect?: (id: string) => void;
  readonly onActivate?: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(options[0]!.id);
  return (
    <ActionDial
      options={options}
      selectedId={selectedId}
      onSelect={id => {
        setSelectedId(id);
        onSelect(id);
      }}
      onActivate={onActivate}
      actionLabel='Stream Now'
      groupLabel='Choose a streaming service'
    />
  );
}

export function mockActionDialMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

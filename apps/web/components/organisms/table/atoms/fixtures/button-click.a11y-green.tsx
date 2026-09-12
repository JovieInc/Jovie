import { Button } from '@jovie/ui';

/**
 * Green neighbor: a real control may take click handlers without a suppression.
 * Uses the canonical @jovie/ui Button so the raw-button ratchet stays at its baseline.
 */
export function TableCellButtonClickGreen() {
  return (
    <Button type='button' onClick={() => undefined}>
      Select row
    </Button>
  );
}

import { lintCopy } from '@jovie/copy';
import { describe, expect, it } from 'vitest';
import {
  PLAYBOOK_ASSIST_DESCRIPTION,
  PLAYBOOK_ASSIST_LABEL,
  PLAYBOOK_AUTONOMY_DESCRIPTION,
  PLAYBOOK_AUTONOMY_LABEL,
  PLAYBOOK_LAUNCH_SIZES,
  PLAYBOOK_PICKER_COPY,
  playbookStartedToast,
  playbookStepCountLabel,
} from './copy';

describe('playbook picker copy', () => {
  it('passes the product UI copy gate', () => {
    const strings = [
      ...Object.values(PLAYBOOK_PICKER_COPY),
      ...Object.values(PLAYBOOK_ASSIST_LABEL),
      ...Object.values(PLAYBOOK_ASSIST_DESCRIPTION),
      ...Object.values(PLAYBOOK_AUTONOMY_LABEL),
      ...Object.values(PLAYBOOK_AUTONOMY_DESCRIPTION),
      ...PLAYBOOK_LAUNCH_SIZES.map(([, label]) => label),
      playbookStartedToast(17, 'Podcast Episode'),
    ];

    const blocking = strings.flatMap(text =>
      lintCopy(text, { register: 'jovie-product-ui' }).blocking.map(
        finding => `${finding.rule}: "${finding.match}" in "${text}"`
      )
    );
    expect(blocking).toEqual([]);
  });

  it('pluralizes step counts', () => {
    expect(playbookStepCountLabel(1)).toBe('1 Step');
    expect(playbookStepCountLabel(17)).toBe('17 Steps');
  });
});

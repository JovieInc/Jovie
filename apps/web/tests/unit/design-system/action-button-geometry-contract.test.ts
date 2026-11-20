import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACTION_BUTTON_MOBILE_HIT_TARGET_PX,
  ACTION_BUTTON_VISIBLE_HEIGHT_PX,
} from '@jovie/ui/atoms/button-contract';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

describe('shared ActionButton geometry contract', () => {
  it('keeps web KEEP 28/44 and projects the same values into native metrics', () => {
    expect(ACTION_BUTTON_VISIBLE_HEIGHT_PX).toBe(28);
    expect(ACTION_BUTTON_MOBILE_HIT_TARGET_PX).toBe(44);

    const nativeTheme = readFileSync(
      join(REPO_ROOT, 'apps/ios/Jovie/DesignSystem/JovieTheme.swift'),
      'utf8'
    );
    const nativeManifest = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'apps/ios/scripts/native-design-system.manifest.json'),
        'utf8'
      )
    );
    const chatComposer = readFileSync(
      join(REPO_ROOT, 'apps/ios/Jovie/Features/Chat/ChatComposerBar.swift'),
      'utf8'
    );

    expect(nativeManifest.actionButtonContract).toBe(
      'packages/ui/atoms/button-contract.ts'
    );
    expect(nativeManifest.actionButtonBindings).toEqual([
      ['height', 'ACTION_BUTTON_VISIBLE_HEIGHT_PX'],
      ['hitTarget', 'ACTION_BUTTON_MOBILE_HIT_TARGET_PX'],
    ]);
    expect(nativeTheme).toContain('static let height: CGFloat = 28');
    expect(nativeTheme).toContain('static let hitTarget: CGFloat = 44');
    expect(nativeTheme).toContain(
      'static let visibleHeight = JovieActionButtonMetrics.height'
    );
    expect(nativeTheme).toContain(
      'static let minimumHitHeight = JovieActionButtonMetrics.hitTarget'
    );
    expect(chatComposer).toContain(
      'static let lockedControlSize: CGFloat = 32'
    );
    expect(chatComposer).not.toContain(
      'sendSlotSize = JovieActionButtonMetrics.height'
    );
  });
});

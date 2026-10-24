import { CommandPalettePanel } from '@/components/features/commands/CommandPalettePanel';
import { COMMAND_PALETTE_COPY } from '@/data/commandPaletteCopy';
import { ProductFeatureLanding } from '../ProductFeatureLanding';

export function CommandPaletteLanding() {
  return (
    <ProductFeatureLanding
      slug='command-palette'
      owner='apps/web/app/(marketing)/product/command-palette/CommandPaletteLanding.tsx'
      copy={COMMAND_PALETTE_COPY}
    >
      <CommandPalettePanel />
    </ProductFeatureLanding>
  );
}

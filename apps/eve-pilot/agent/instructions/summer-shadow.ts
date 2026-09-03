import { defineDynamic, defineInstructions } from 'eve/instructions';
import { bindEvePilotIdentity } from '../select-identity';

export function summerShadowInstructionsForMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
) {
  if (
    metadata?.source !== 'ovie-summer-shadow' ||
    metadata.identity !== 'summer' ||
    metadata.dispatchAuthority !== 'none'
  ) {
    return null;
  }

  const summer = bindEvePilotIdentity('summer');
  return defineInstructions({ content: summer.instructions });
}

export default defineDynamic({
  events: {
    'session.started'(_event, ctx) {
      return summerShadowInstructionsForMetadata(ctx.channel.metadata);
    },
  },
});

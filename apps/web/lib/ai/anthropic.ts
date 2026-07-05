import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

export function getAnthropicClient(): Anthropic {
  return new Anthropic();
}

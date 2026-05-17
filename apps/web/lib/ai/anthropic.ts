import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { wrapAnthropic } from 'braintrust';

export function getAnthropicClient(): Anthropic {
  return wrapAnthropic(new Anthropic());
}

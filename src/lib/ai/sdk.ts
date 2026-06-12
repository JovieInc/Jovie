import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, CoreMessage } from 'ai';
import { compressContext, CompressionResult } from './context-compression';

// Configuration for Headroom context compression
const COMPRESSION_CONFIG = {
  // If total input tokens exceed this, trigger compression
  headroomThresholdTokens: 4000, 
  // Target tokens after compression
  targetTokens: 2000,
  // Enable/disable the feature via env
  enabled: process.env.ENABLE_HEADROOM_COMPRESSION === 'true',
  // Log cost savings (mock implementation for now)
  logSavings: true
};

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Intercepts the AI call to evaluate and apply Headroom context compression.
 * This addresses Issue #10770 by reducing token costs for verbose tool outputs.
 */
export async function generateTextWithHeadroom(
  messages: CoreMessage[],
  options: { model?: string; temperature?: number } = {}
) {
  if (!COMPRESSION_CONFIG.enabled) {
    return generateText({
      model: openai(options.model || 'gpt-4o'),
      messages,
      temperature: options.temperature,
    });
  }

  // 1. Estimate current token count (using a simple heuristic or a tokenizer library in production)
  // For this implementation, we assume a helper exists or we estimate based on string length * 0.25
  const estimatedTokens = messages.reduce((acc, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return acc + (content.length * 0.25);
  }, 0);

  if (estimatedTokens > COMPRESSION_CONFIG.headroomThresholdTokens) {
    console.log(`[Headroom] Context size (${Math.round(estimatedTokens)} tokens) exceeds threshold. Compressing...`);
    
    const compressionResult = compressContext(messages, {
      targetTokens: COMPRESSION_CONFIG.targetTokens,
      strategy: 'summarize-verbose-tools'
    });

    if (compressionResult.wasCompressed) {
      console.log(`[Headroom] Compression successful. Reduced from ${compressionResult.originalTokens} to ${compressionResult.compressedTokens} tokens.`);
      
      if (COMPRESSION_CONFIG.logSavings) {
        // Mock cost calculation: $0.01 per 1k tokens for input
        const savedTokens = compressionResult.originalTokens - compressionResult.compressedTokens;
        const estimatedSavings = (savedTokens / 1000) * 0.01;
        console.log(`[Headroom] Estimated cost savings: $${estimatedSavings.toFixed(4)} per call.`);
      }

      return generateText({
        model: openai(options.model || 'gpt-4o'),
        messages: compressionResult.messages,
        temperature: options.temperature,
      });
    }
  }

  // Fallback to standard generation if no compression needed or failed
  return generateText({
    model: openai(options.model || 'gpt-4o'),
    messages,
    temperature: options.temperature,
  });
}

/**
 * Stream version with headroom compression
 */
export async function streamTextWithHeadroom(
  messages: CoreMessage[],
  options: { model?: string; temperature?: number } = {}
) {
  if (!COMPRESSION_CONFIG.enabled) {
    return streamText({
      model: openai(options.model || 'gpt-4o'),
      messages,
      temperature: options.temperature,
    });
  }

  const estimatedTokens = messages.reduce((acc, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return acc + (content.length * 0.25);
  }, 0);

  if (estimatedTokens > COMPRESSION_CONFIG.headroomThresholdTokens) {
    const compressionResult = compressContext(messages, {
      targetTokens: COMPRESSION_CONFIG.targetTokens,
      strategy: 'summarize-verbose-tools'
    });

    if (compressionResult.wasCompressed) {
      return streamText({
        model: openai(options.model || 'gpt-4o'),
        messages: compressionResult.messages,
        temperature: options.temperature,
      });
    }
  }

  return streamText({
    model: openai(options.model || 'gpt-4o'),
    messages,
    temperature: options.temperature,
  });
}
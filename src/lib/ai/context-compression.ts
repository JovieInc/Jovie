import { CoreMessage, ToolCallPart, ToolResultPart } from 'ai';

export interface CompressionResult {
  wasCompressed: boolean;
  originalTokens: number;
  compressedTokens: number;
  messages: CoreMessage[];
}

export interface CompressionOptions {
  targetTokens: number;
  strategy: 'summarize-verbose-tools' | 'truncate-oldest';
}

/**
 * Compresses context by summarizing verbose tool outputs (Gmail, Calendar, Memory).
 * This is the core logic for Issue #10770.
 */
export function compressContext(
  messages: CoreMessage[],
  options: CompressionOptions
): CompressionResult {
  const originalLength = JSON.stringify(messages).length;
  const estimatedOriginalTokens = originalLength * 0.25;

  // If we are already under the target, no need to compress
  if (estimatedOriginalTokens <= options.targetTokens) {
    return {
      wasCompressed: false,
      originalTokens: Math.round(estimatedOriginalTokens),
      compressedTokens: Math.round(estimatedOriginalTokens),
      messages,
    };
  }

  const compressedMessages: CoreMessage[] = [];
  let currentTokens = 0;
  const targetTokens = options.targetTokens;

  // Strategy: Summarize verbose tool results
  for (const message of messages) {
    // If the message is a user message or system message, keep as is (or truncate if absolutely necessary)
    if (message.role !== 'assistant' && message.role !== 'tool') {
      compressedMessages.push(message);
      currentTokens += (JSON.stringify(message).length * 0.25);
      continue;
    }

    // Handle Tool Results (The primary target for compression)
    if (message.role === 'tool' && Array.isArray(message.content)) {
      const newContent: (ToolResultPart | string)[] = [];
      
      for (const part of message.content) {
        if (part.type === 'tool-result') {
          const toolName = part.toolName;
          const result = part.result;
          
          // Identify verbose tools
          const verboseTools = ['gmail_get_messages', 'calendar_list_events', 'memory_get_facts', 'workflow_run_logs'];
          
          if (verboseTools.includes(toolName)) {
            // Create a summary instead of the full raw JSON
            const summary = summarizeToolOutput(toolName, result);
            newContent.push({
              type: 'tool-result',
              toolName: toolName,
              toolCallId: part.toolCallId,
              result: summary, // Replace verbose result with summary
            });
          } else {
            newContent.push(part);
          }
        } else {
          newContent.push(part);
        }
      }
      
      compressedMessages.push({
        ...message,
        content: newContent,
      });
    } else {
      // For other messages, just push them
      compressedMessages.push(message);
    }

    // Re-calculate tokens for the new message
    currentTokens += (JSON.stringify(compressedMessages[compressedMessages.length - 1]).length * 0.25);

    // Safety break if we hit the target
    if (currentTokens >= targetTokens) {
      break;
    }
  }

  const finalLength = JSON.stringify(compressedMessages).length;
  const estimatedCompressedTokens = finalLength * 0.25;

  return {
    wasCompressed: true,
    originalTokens: Math.round(estimatedOriginalTokens),
    compressedTokens: Math.round(estimatedCompressedTokens),
    messages: compressedMessages,
  };
}

/**
 * Summarizes verbose tool outputs to reduce token count while preserving intent.
 */
function summarizeToolOutput(toolName: string, result: any): any {
  if (typeof result !== 'object' || result === null) return result;

  // Gmail: Summarize list of emails
  if (toolName === 'gmail_get_messages' && Array.isArray(result)) {
    return {
      summary: `Found ${result.length} emails.`,
      top_results: result.slice(0, 3).map((email: any) => ({
        id: email.id,
        subject: email.subject,
        snippet: email.snippet,
        from: email.from,
      })),
      note: "Full list truncated for context efficiency. Request specific IDs if needed."
    };
  }

  // Calendar: Summarize events
  if (toolName === 'calendar_list_events' && Array.isArray(result)) {
    return {
      summary: `Found ${result.length} upcoming events.`,
      top_results: result.slice(0, 5).map((event: any) => ({
        id: event.id,
        title: event.summary,
        start: event.start,
        end: event.end,
      })),
      note: "Full list truncated. Request specific event IDs for details."
    };
  }

  // Memory: Summarize facts
  if (toolName === 'memory_get_facts' && Array.isArray(result)) {
    return {
      summary: `Retrieved ${result.length} memory facts.`,
      facts: result.slice(0, 10), // Keep top 10, truncate rest
      note: "Memory context truncated."
    };
  }

  // Generic fallback for large JSON objects
  if (Array.isArray(result) && result.length > 20) {
    return {
      summary: `Array of ${result.length} items.`,
      sample: result.slice(0, 5),
      note: "Truncated for cost efficiency."
    };
  }

  if (typeof result === 'object' && Object.keys(result).length > 50) {
    const keys = Object.keys(result);
    const sampleKeys = keys.slice(0, 10);
    const sample: any = {};
    sampleKeys.forEach(k => sample[k] = result[k]);
    
    return {
      summary: `Object with ${keys.length} keys.`,
      sample,
      note: "Object truncated for cost efficiency."
    };
  }

  return result;
}
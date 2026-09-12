/**
 * Shared product-voice copy and accessible names for the chat composer.
 * Keep loading skeleton, ChatInput defaults, and live surface in lockstep.
 */

/** Ovie door placeholder — founder talk door, not artist empty-chat copy. */
export const CHAT_COMPOSER_OVIE_EMPTY_PLACEHOLDER = 'Ask Ovie...';

/**
 * Artist empty chat has no placeholder (JOV-5319). Ovie keeps its door copy.
 */
export function composerPlaceholderForChatMode(
  chatMode: 'ov' | null | undefined
): string {
  return chatMode === 'ov' ? CHAT_COMPOSER_OVIE_EMPTY_PLACEHOLDER : '';
}

/** Form region accessible name (Title Case product UI). */
export const CHAT_COMPOSER_FORM_ARIA_LABEL =
  'Compose A Message — Type / For Skills And References';

/** Textarea accessible name (Title Case product UI). */
export const CHAT_COMPOSER_INPUT_ARIA_LABEL = 'Chat Message Input';

/** Primary send control accessible name. */
export const CHAT_COMPOSER_SEND_ARIA_LABEL = 'Send message';

/** Stop-generation control accessible name. */
export const CHAT_COMPOSER_STOP_ARIA_LABEL = 'Stop generating';

/** Attach menu trigger accessible name. */
export const CHAT_COMPOSER_ATTACH_ARIA_LABEL = 'Attachment options';

/** Shared palette action for the existing supported-audio upload path. */
export const CHAT_COMPOSER_UPLOAD_AUDIO_LABEL = 'Upload audio';

/** Supported audio formats shown next to the audio-upload action. */
export const CHAT_COMPOSER_UPLOAD_AUDIO_HINT = 'MP3, WAV, FLAC, AAC';

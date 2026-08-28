/** Shared composer column width — input dock and empty-state shell. */
export const CHAT_CONTENT_SHELL_CLASSNAME = 'system-b-chat-content-shell';

/** Transcript read column — capped for comfortable line length. */
export const CHAT_MESSAGE_CONTENT_SHELL_CLASSNAME =
  'system-b-chat-message-content-shell';

/** Thread composer dock — overlays the scroll viewport at the bottom. */
export const CHAT_COMPOSER_DOCK_CLASSNAME = 'system-b-chat-composer-dock';

/** Gradient veil so transcript copy fades behind the floating composer. */
export const CHAT_COMPOSER_SCROLL_FADE_CLASSNAME =
  'system-b-chat-composer-scroll-fade';

/** Bottom inset so the last message can scroll behind the composer. */
export const CHAT_COMPOSER_THREAD_SCROLL_PADDING_CLASSNAME =
  'system-b-chat-composer-thread-scroll-padding';

/** Inline max-width token for motion surfaces that cannot use the shell class. */
export const CHAT_COMPOSER_MAX_WIDTH = '45rem';

/**
 * Empty New Chat viewport owns content-area top inset. Nested shells must not
 * add another gap under the shell header.
 */
export const CHAT_EMPTY_TOP_SPACING_OWNER = 'chat-empty-viewport';

/** Horizontal inset shared with the desktop header grid. */
export const CHAT_EMPTY_VIEWPORT_CLASSNAME =
  'flex flex-col px-(--linear-app-header-padding-x) pt-0 pb-5';

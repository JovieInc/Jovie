export type CanvasView =
  | 'demo'
  | 'releases'
  | 'tracks'
  | 'tasks'
  | 'library'
  | 'lyrics'
  | 'settings'
  | 'thread'
  | 'onboarding';

export function parseCanvasViewParam(value: string | null): CanvasView {
  switch (value) {
    case 'demo':
    case 'releases':
    case 'tracks':
    case 'tasks':
    case 'library':
    case 'lyrics':
    case 'settings':
    case 'thread':
    case 'onboarding':
      return value;
    default:
      return 'demo';
  }
}

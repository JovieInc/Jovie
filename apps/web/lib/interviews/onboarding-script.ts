export interface InterviewQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly placeholder?: string;
}

export const ONBOARDING_INTERVIEW_QUESTIONS: readonly InterviewQuestion[] = [
  {
    id: 'last_time_shared',
    prompt:
      'Last time a fan asked where to find your music — what did you actually send them?',
    placeholder: 'A Linktree, a DM, a Spotify link...',
  },
  {
    id: 'current_sharing_setup',
    prompt:
      'Walk me through how you share your links right now. Linktree, bio, DMs?',
    placeholder:
      "Don't worry about the 'right' answer — whatever you actually do.",
  },
  {
    id: 'most_annoying',
    prompt: "What's the most annoying part of your current setup?",
    placeholder: 'The thing that makes you roll your eyes every time.',
  },
  {
    id: 'tried_before',
    prompt: "What else have you tried for this? Why'd you stop using it?",
    placeholder: 'Linktree, Beacons, Carrd, Bio.fm, a Notion page...',
  },
  {
    id: 'fallback',
    prompt:
      'If Jovie disappeared tomorrow, what would you go back to — and what would bug you about that?',
    placeholder: 'Be honest. This helps us build the right thing.',
  },
];

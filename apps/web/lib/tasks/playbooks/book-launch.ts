import type { PlaybookTemplate } from './types';

const FERRISS_HOW_TO_GET_PUBLISHED =
  'https://tim.blog/2014/02/04/how-to-get-published/';
const FERRISS_GLOBAL_PHENOMENON =
  'https://tim.blog/2009/12/13/how-to-create-a-global-phenomenon-for-less-than-10000/';
const FERRISS_4HC_WEEK_ONE =
  'https://tim.blog/2012/11/24/the-4-hour-chef-launch-summary-of-week-one/';
const HOLIDAY_PERENNIAL_SELLER =
  'https://www.penguinrandomhouse.com/books/534365/perennial-seller-by-ryan-holiday/';

/**
 * Book launch, anchored to publication day. Distilled from Tim Ferriss's
 * published launch write-ups (title testing, pitching the trend rather than
 * the book, advance copies to influencers, a stacked launch-week interview
 * run, bulk-order bonuses) and Ryan Holiday's Perennial Seller (position
 * before you market, own the platform, lower the cost of trying, keep
 * marketing after launch week). Summarized in our own words; no quotes.
 * Checklist-only: no shipped Jovie workflow runs any of these steps yet.
 */
export const BOOK_LAUNCH_PLAYBOOK: PlaybookTemplate = {
  id: 'book-launch',
  version: 1,
  name: 'Book Launch',
  summary:
    'Six months of positioning, list building, advance copies and interviews, then launch week and the long tail.',
  targetDateLabel: 'Publication Date',
  projectNamePlaceholder: 'Book title',
  assistMode: 'checklist_only',
  anchor: 'date',
  sources: [
    {
      title: 'How to Write a Bestselling Book This Year',
      author: 'Tim Ferriss',
      url: FERRISS_HOW_TO_GET_PUBLISHED,
    },
    {
      title: 'How to Create a Global Phenomenon for Less Than $10,000',
      author: 'Tim Ferriss',
      url: FERRISS_GLOBAL_PHENOMENON,
    },
    {
      title: 'The 4-Hour Chef Launch: Marketing/PR Summary of Week One',
      author: 'Tim Ferriss',
      url: FERRISS_4HC_WEEK_ONE,
    },
    {
      title: 'Perennial Seller',
      author: 'Ryan Holiday',
      url: HOLIDAY_PERENNIAL_SELLER,
    },
  ],
  steps: [
    {
      id: 'name-the-reader',
      title: 'Name the reader and the shift the book explains',
      phase: 'Positioning',
      offsetDays: -180,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Write the book for a few specific people you know. Media and influencers respond to a bigger change the book explains, not to the book itself.',
      learnMoreUrl: HOLIDAY_PERENNIAL_SELLER,
    },
    {
      id: 'test-titles',
      title: 'Test title and subtitle options with small ad buys',
      phase: 'Positioning',
      offsetDays: -150,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Run the candidate titles as cheap search ads and let click-through pick the winner. Your favorite may lose.',
      learnMoreUrl: FERRISS_HOW_TO_GET_PUBLISHED,
    },
    {
      id: 'grow-email-list',
      title: 'Start or grow your email list',
      phase: 'Positioning',
      offsetDays: -120,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'An email list is the channel you own. It outlasts any one launch and does the heavy lifting on launch day.',
    },
    {
      id: 'ask-recent-authors',
      title: 'Ask authors who launched recently what worked',
      phase: 'Pre-Launch',
      offsetDays: -100,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'Channels change fast. A few calls with recent launchers tell you where readers in your category actually find books now.',
    },
    {
      id: 'influencer-list',
      title: 'List the people whose recommendation reaches your readers',
      phase: 'Pre-Launch',
      offsetDays: -90,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Bloggers, podcast hosts, newsletter writers and community leads. Meet them where they gather and offer something useful first.',
      learnMoreUrl: FERRISS_GLOBAL_PHENOMENON,
    },
    {
      id: 'announce-and-preorders',
      title: 'Announce the book and open preorders',
      phase: 'Pre-Launch',
      offsetDays: -60,
      owner: 'creator',
      priority: 'high',
    },
    {
      id: 'free-content',
      title: 'Publish free, useful pieces on the book’s topic',
      phase: 'Pre-Launch',
      offsetDays: -60,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'Mention the book in a minority of them. The goal is to be worth following, so the launch lands with people who already trust you.',
    },
    {
      id: 'book-interviews',
      title: 'Book podcast, radio and press interviews for launch week',
      phase: 'Pre-Launch',
      offsetDays: -45,
      owner: 'collaborator',
      priority: 'high',
      explainerText:
        'Pitch in layers, smaller outlets first, so each yes makes the next pitch easier. Cluster the interviews in launch week.',
    },
    {
      id: 'advance-copies',
      title: 'Send advance copies to your list of recommenders',
      phase: 'Pre-Launch',
      offsetDays: -42,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Getting the book into the right hands early is the cheapest way to make trying it easy and to start word of mouth.',
    },
    {
      id: 'bulk-order-bonuses',
      title: 'Set up preorder and bulk-order bonuses',
      phase: 'Pre-Launch',
      offsetDays: -30,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'Bonuses only you can give, such as a call, a workshop or extra material, reward readers who buy early or buy for their team.',
    },
    {
      id: 'free-excerpt',
      title: 'Share a free chapter or excerpt',
      phase: 'Pre-Launch',
      offsetDays: -14,
      owner: 'creator',
      priority: 'medium',
    },
    {
      id: 'launch-day-email-draft',
      title: 'Draft the launch-day email to advance readers',
      phase: 'Launch Week',
      offsetDays: -1,
      owner: 'creator',
      priority: 'high',
      explainerText:
        'Ask for one thing: an honest review posted on launch day. Make it a single click from the email.',
    },
    {
      id: 'launch-day',
      title: 'Email your list and advance readers',
      phase: 'Launch Week',
      offsetDays: 0,
      owner: 'creator',
      priority: 'urgent',
    },
    {
      id: 'interview-run',
      title: 'Do the launch-week interview run',
      phase: 'Launch Week',
      offsetDays: 0,
      owner: 'creator',
      priority: 'high',
      learnMoreUrl: FERRISS_4HC_WEEK_ONE,
    },
    {
      id: 'share-reactions',
      title: 'Share reader reactions and press as they land',
      phase: 'Launch Week',
      offsetDays: 3,
      owner: 'creator',
      priority: 'medium',
    },
    {
      id: 'follow-up-reviewers',
      title: 'Follow up with everyone who offered to review or share',
      phase: 'Long Tail',
      offsetDays: 14,
      owner: 'creator',
      priority: 'medium',
    },
    {
      id: 'new-angles',
      title: 'Pitch fresh angles from the book to press and podcasts',
      phase: 'Long Tail',
      offsetDays: 30,
      owner: 'creator',
      priority: 'medium',
      explainerText:
        'Launch week is a sprint; lasting sales come from word of mouth and steady effort after it. Each chapter can be its own story.',
      learnMoreUrl: HOLIDAY_PERENNIAL_SELLER,
    },
    {
      id: 'plan-next-push',
      title: 'Plan the next push: paperback, talks or partnerships',
      phase: 'Long Tail',
      offsetDays: 90,
      owner: 'creator',
      priority: 'low',
    },
  ],
};

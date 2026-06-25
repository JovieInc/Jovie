// Authored preview — FaqSection. Realistic FAQ copy ported from the homepage's
// own data (apps/web/data/homepageLaunchCopy.ts → faq). Imports from the exact
// package specifier so the converter shims it to window.JovieHome.
import { FaqSection } from 'apps/web/components';

const ITEMS = [
  {
    question: 'What does Jovie actually do?',
    answer:
      'Connect your music. Jovie watches your catalog, fans, and stream movement, then surfaces specific opportunities. A release worth a presave. A playlist that fits your sound. A fan moment to capture.',
  },
  {
    question: 'Where does my catalog data come from?',
    answer:
      'Spotify, Apple Music, and your DSPs. Connect once. Jovie keeps every release, asset, and fan path in one place.',
  },
  {
    question: 'Does Jovie post or pitch on my behalf?',
    answer:
      'Only when you say so. Jovie surfaces and drafts. You decide what goes live.',
  },
  {
    question: 'How does Jovie know what is worth surfacing?',
    answer:
      'It watches every track in your catalog every day. Streams, fan moments, playlist movement, and editorial activity all feed the model.',
  },
  {
    question: 'Who is Jovie for?',
    answer:
      'Artists with a catalog already out and the team around them. Built for the work between drops, not just launch week.',
  },
];

export function Questions() {
  return <FaqSection heading='Questions' items={ITEMS} />;
}

export function ShortList() {
  return <FaqSection heading='Common questions' items={ITEMS.slice(0, 3)} />;
}

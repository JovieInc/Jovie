'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';

type Step = 'start' | 'budget' | 'released' | 'streams' | 'marketing';
type Result =
  | 'no-budget'
  | 'no-released'
  | 'no-streams'
  | 'no-marketing'
  | 'yes';

function QuizContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const step = (searchParams.get('step') as Step) || 'start';
  const result = searchParams.get('result') as Result | null;

  const [budget, setBudget] = useState(searchParams.get('budget') || '');
  const [streams, setStreams] = useState(searchParams.get('streams') || '');
  const [marketing, setMarketing] = useState(
    searchParams.get('marketing') || ''
  );

  const navigate = useCallback(
    (params: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        newParams.set(key, value);
      }
      router.push(`?${newParams.toString()}`);
    },
    [router, searchParams]
  );

  // Result screens
  if (result) {
    return <ResultScreen result={result} />;
  }

  // Start screen
  if (step === 'start') {
    return (
      <div className='min-h-screen flex items-center justify-center p-6'>
        <div className='w-full max-w-xl text-center'>
          <h1 className='text-4xl md:text-5xl font-bold mb-12'>
            Should I Make a Music Video?
          </h1>
          <button
            type='button'
            className='btn-primary'
            onClick={() => navigate({ step: 'budget' })}
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  // Budget question
  if (step === 'budget') {
    const handleSubmit = () => {
      const budgetNum = Number.parseInt(budget, 10);
      if (budgetNum < 10000) {
        navigate({ result: 'no-budget' });
      } else {
        navigate({ step: 'released', budget });
      }
    };

    return (
      <Question question="What's your total music budget?">
        <div className='relative'>
          <span className='absolute left-4 top-1/2 -translate-y-1/2 text-lg'>
            $
          </span>
          <input
            type='number'
            className='input-field pl-8'
            placeholder='e.g. 5000'
            value={budget}
            onChange={e => setBudget(e.target.value)}
            min='0'
          />
        </div>
        <button
          type='button'
          className='btn-primary w-full mt-6'
          onClick={handleSubmit}
          disabled={!budget || Number.parseInt(budget, 10) <= 0}
        >
          Next
        </button>
      </Question>
    );
  }

  // Released question
  if (step === 'released') {
    return (
      <Question question='Is the song already released?'>
        <div className='flex flex-col sm:flex-row gap-4'>
          <button
            type='button'
            className='btn-primary flex-1'
            onClick={() =>
              navigate({ step: 'streams', released: 'yes', budget })
            }
          >
            Yes
          </button>
          <button
            type='button'
            className='btn-primary flex-1'
            onClick={() => navigate({ result: 'no-released' })}
          >
            No
          </button>
        </div>
      </Question>
    );
  }

  // Streams question
  if (step === 'streams') {
    const handleSubmit = () => {
      const streamsNum = Number.parseInt(streams, 10);
      if (streamsNum < 1000000) {
        navigate({ result: 'no-streams' });
      } else {
        navigate({ step: 'marketing', streams });
      }
    };

    return (
      <Question question='How many streams does it have?'>
        <input
          type='number'
          className='input-field'
          placeholder='e.g. 250000'
          value={streams}
          onChange={e => setStreams(e.target.value)}
          min='0'
        />
        <p className='text-sm text-muted mt-2'>Total across all platforms</p>
        <button
          type='button'
          className='btn-primary w-full mt-6'
          onClick={handleSubmit}
          disabled={!streams || Number.parseInt(streams, 10) <= 0}
        >
          Next
        </button>
      </Question>
    );
  }

  // Marketing question
  if (step === 'marketing') {
    const handleSubmit = () => {
      const marketingNum = Number.parseInt(marketing, 10);
      if (marketingNum < 1000) {
        navigate({ result: 'no-marketing' });
      } else {
        navigate({ result: 'yes' });
      }
    };

    return (
      <Question question='How much will you spend MARKETING this video?'>
        <div className='relative'>
          <span className='absolute left-4 top-1/2 -translate-y-1/2 text-lg'>
            $
          </span>
          <input
            type='number'
            className='input-field pl-8'
            placeholder='e.g. 2000'
            value={marketing}
            onChange={e => setMarketing(e.target.value)}
            min='0'
          />
        </div>
        <p className='text-sm text-muted mt-2'>
          TikTok ads, influencer seeding, PR, etc.
        </p>
        <button
          type='button'
          className='btn-primary w-full mt-6'
          onClick={handleSubmit}
          disabled={!marketing || Number.parseInt(marketing, 10) <= 0}
        >
          Next
        </button>
      </Question>
    );
  }

  return null;
}

function Question({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div className='min-h-screen flex items-center justify-center p-6'>
      <div className='w-full max-w-xl'>
        <h2 className='text-2xl md:text-3xl font-semibold mb-8 text-center'>
          {question}
        </h2>
        {children}
      </div>
    </div>
  );
}

function ResultScreen({ result }: { result: Result }) {
  const results: Record<
    Result,
    { title: string; body: React.ReactNode; cta: string }
  > = {
    'no-budget': {
      title: 'NO.',
      body: (
        <>
          <p className='text-xl font-semibold mb-4'>
            Build your fanbase first, not your portfolio.
          </p>
          <p className='text-lg text-muted'>
            Most indie artists spend their entire budget on production, then
            have nothing left to get the music heard. Start with
            promotion—content comes later.
          </p>
        </>
      ),
      cta: 'Learn how to actually grow your audience →',
    },
    'no-released': {
      title: 'NO.',
      body: (
        <>
          <p className='text-xl font-semibold mb-4'>
            Don't make a video for a song that doesn't exist yet.
          </p>
          <p className='text-lg text-muted'>
            You're betting $10k+ on something completely unproven. Release the
            song, see if people actually like it, then decide.
          </p>
        </>
      ),
      cta: 'Get your music in front of fans →',
    },
    'no-streams': {
      title: 'NO.',
      body: (
        <>
          <p className='text-xl font-semibold mb-4'>
            The song hasn't proven itself yet.
          </p>
          <p className='text-lg text-muted'>
            Making a music video won't make a mediocre song go viral. Double
            down on what's already working—if this song isn't taking off, the
            next one might be.
          </p>
        </>
      ),
      cta: 'Build real momentum instead →',
    },
    'no-marketing': {
      title: 'NO.',
      body: (
        <>
          <p className='text-xl font-semibold mb-4'>
            A tree falling in the forest.
          </p>
          <p className='text-lg text-muted'>
            You'll spend $10k making it and $0 getting people to watch it.
            That's not a music video strategy, that's a Vimeo graveyard.
          </p>
          <p className='text-lg font-semibold mt-4'>
            Marketing budget &gt; Production budget. Always.
          </p>
        </>
      ),
      cta: 'Spend it on promotion instead →',
    },
    yes: {
      title: 'MAYBE.',
      body: (
        <>
          <p className='text-lg mb-4'>You've got:</p>
          <ul className='text-lg mb-6 space-y-2'>
            <li>✓ Budget ($10k+)</li>
            <li>✓ Proven song (1M+ streams)</li>
            <li>✓ Marketing budget ($1k+)</li>
          </ul>
          <p className='text-lg text-muted mb-4'>
            You've validated demand and have money to promote it.
          </p>
          <p className='text-lg text-muted'>
            If you're making a 60-second vertical video for TikTok/Reels, go for
            it.
          </p>
          <p className='text-lg text-muted mt-4'>
            If you're making a 4-minute cinematic masterpiece... ask yourself if
            that's really what moves the needle in 2025.
          </p>
        </>
      ),
      cta: 'Get more eyes on your music →',
    },
  };

  const content = results[result];

  return (
    <div className='min-h-screen flex items-center justify-center p-6'>
      <div className='w-full max-w-xl text-center'>
        <h1 className='text-5xl md:text-6xl font-bold mb-8'>{content.title}</h1>
        <div className='text-left mb-8'>{content.body}</div>
        <a
          href='https://jov.ie'
          className='inline-block text-lg underline hover:no-underline'
          target='_blank'
          rel='noopener noreferrer'
        >
          {content.cta}
        </a>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen flex items-center justify-center'>
          <div className='text-xl'>Loading...</div>
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  );
}

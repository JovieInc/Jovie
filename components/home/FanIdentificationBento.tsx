import { AlertTriangle, CheckCircle2, CircleDot } from 'lucide-react';
import { Container } from '@/components/site/Container';

type FanInsightCardTone = 'success' | 'warning' | 'danger';

type FanInsightCard = {
    id: string;
    tone: FanInsightCardTone;
    title: string;
    summary: string;
    timestampLabel: string;
};

const CARDS: readonly FanInsightCard[] = [
    {
        id: 'high-intent',
        tone: 'success',
        title: 'Identified high-intent fan',
        summary: 'Recognized repeat visits + clicks across Listen and Merch.',
        timestampLabel: 'Just now',
    },
    {
        id: 'at-risk',
        tone: 'warning',
        title: 'At risk of drop-off',
        summary: 'Mobile bounce rising — shorten the top CTA and reorder modules.',
        timestampLabel: '2h ago',
    },
    {
        id: 'lost',
        tone: 'danger',
        title: 'Off track',
        summary: 'Fan hit a dead-end link — swapped destination to a working deep link.',
        timestampLabel: 'Yesterday',
    },
] as const;

function toneStyles(tone: FanInsightCardTone): {
    icon: React.ReactNode;
    ring: string;
    dotBg: string;
    dotFg: string;
} {
    switch (tone) {
        case 'success':
            return {
                icon: <CheckCircle2 className='h-4 w-4' aria-hidden='true' />,
                ring: 'border-green-500/30',
                dotBg: 'bg-green-500/15',
                dotFg: 'text-green-600 dark:text-green-400',
            };
        case 'warning':
            return {
                icon: <AlertTriangle className='h-4 w-4' aria-hidden='true' />,
                ring: 'border-orange-500/30',
                dotBg: 'bg-orange-500/15',
                dotFg: 'text-orange-600 dark:text-orange-400',
            };
        case 'danger':
            return {
                icon: <CircleDot className='h-4 w-4' aria-hidden='true' />,
                ring: 'border-red-500/30',
                dotBg: 'bg-red-500/15',
                dotFg: 'text-red-600 dark:text-red-400',
            };
        default: {
            const exhaustive: never = tone;
            return exhaustive;
        }
    }
}

export function FanIdentificationBento() {
    return (
        <section className='relative py-16 sm:py-20 bg-base overflow-hidden'>
            <div className='absolute inset-0 -z-10'>
                <div className='absolute inset-0 grid-bg opacity-60' />
                <div className='absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.10),transparent)] dark:bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,rgba(120,119,198,0.18),transparent)]' />
                <div className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-base to-transparent dark:from-base' />
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-base to-transparent dark:from-base' />
            </div>

            <Container>
                <div className='mx-auto max-w-5xl'>
                    <div className='grid gap-10 md:grid-cols-12 md:items-start'>
                        <div className='md:col-span-6'>
                            <p className='text-xs font-medium tracking-wide uppercase text-tertiary-token'>
                                Identity + actions
                            </p>

                            <h2 className='mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-primary-token'>
                                We identify fans, then take action.
                            </h2>

                            <p className='mt-3 text-sm sm:text-base leading-relaxed text-secondary-token'>
                                Jovie turns anonymous taps into signals: who they are, what they
                                want, and what they’re likely to do next. Then it automatically
                                adjusts routing, ordering, and follow-up prompts to increase
                                conversion.
                            </p>

                            <div className='mt-6 grid gap-3'>
                                <div className='rounded-2xl border border-subtle bg-surface-1 p-4'>
                                    <div className='text-xs font-medium tracking-wide uppercase text-tertiary-token'>
                                        Signals we use
                                    </div>
                                    <div className='mt-3 grid gap-2 text-sm text-secondary-token'>
                                        <div className='flex gap-2'>
                                            <span className='mt-1 text-tertiary-token'>•</span>
                                            <span>Referrer + device context (e.g., TikTok, mobile)</span>
                                        </div>
                                        <div className='flex gap-2'>
                                            <span className='mt-1 text-tertiary-token'>•</span>
                                            <span>Click sequence (listen → merch → tickets)</span>
                                        </div>
                                        <div className='flex gap-2'>
                                            <span className='mt-1 text-tertiary-token'>•</span>
                                            <span>Repeat visits + time between sessions</span>
                                        </div>
                                    </div>
                                </div>

                                <div className='rounded-2xl border border-subtle bg-surface-1 p-4'>
                                    <div className='text-xs font-medium tracking-wide uppercase text-tertiary-token'>
                                        Actions we take
                                    </div>
                                    <div className='mt-3 grid gap-2 text-sm text-secondary-token'>
                                        <div className='flex gap-2'>
                                            <span className='mt-1 text-tertiary-token'>•</span>
                                            <span>Auto-pin the highest-converting module</span>
                                        </div>
                                        <div className='flex gap-2'>
                                            <span className='mt-1 text-tertiary-token'>•</span>
                                            <span>Swap deep links to reduce drop-off</span>
                                        </div>
                                        <div className='flex gap-2'>
                                            <span className='mt-1 text-tertiary-token'>•</span>
                                            <span>Prompt for contact capture at the right moment</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='md:col-span-6'>
                            <div className='rounded-3xl border border-subtle bg-surface-1 p-6 sm:p-7'>
                                <h3 className='text-lg font-semibold tracking-tight text-primary-token'>
                                    Fan insights
                                </h3>
                                <p className='mt-1 text-sm leading-relaxed text-secondary-token'>
                                    A simple view of what we learn — and what changes automatically.
                                </p>

                                <div className='mt-6'>
                                    <div className='relative'>
                                        {CARDS.map((card, index) => {
                                            const style = toneStyles(card.tone);
                                            const offset = index * 18;
                                            const scale = 1 - index * 0.04;

                                            return (
                                                <div
                                                    key={card.id}
                                                    aria-hidden='true'
                                                    className='absolute left-0 right-0'
                                                    style={{
                                                        transform: `translateY(${offset}px) scale(${scale})`,
                                                        transformOrigin: 'top center',
                                                    }}
                                                >
                                                    <div
                                                        className={`rounded-2xl border bg-surface-0 shadow-[0_18px_60px_-40px_rgba(0,0,0,0.45)] dark:shadow-[0_18px_70px_-40px_rgba(0,0,0,0.7)] ${style.ring}`}
                                                    >
                                                        <div className='p-4'>
                                                            <div className='flex items-center gap-2'>
                                                                <span
                                                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-subtle ${style.dotBg} ${style.dotFg}`}
                                                                >
                                                                    {style.icon}
                                                                </span>
                                                                <div className='text-sm font-medium text-primary-token'>
                                                                    {card.title}
                                                                </div>
                                                            </div>

                                                            <p className='mt-2 text-sm text-secondary-token'>
                                                                {card.summary}
                                                            </p>

                                                            <div className='mt-3 text-xs text-tertiary-token'>
                                                                {card.timestampLabel}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        <div className='pointer-events-none invisible' aria-hidden='true'>
                                            <div className='rounded-2xl border border-subtle bg-surface-0 p-4'>
                                                Spacer
                                            </div>
                                        </div>

                                        <div className='relative pt-[96px] sm:pt-[108px]'>
                                            <div className='h-[170px] sm:h-[190px]' />
                                        </div>
                                    </div>

                                    <div className='mt-4 rounded-2xl border border-subtle bg-surface-0 px-4 py-3'>
                                        <div className='flex items-center justify-between gap-3'>
                                            <div className='text-xs text-tertiary-token'>
                                                Example dashboard feed
                                            </div>
                                            <div className='text-xs font-medium text-secondary-token'>
                                                Updated live
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Container>
        </section>
    );
}

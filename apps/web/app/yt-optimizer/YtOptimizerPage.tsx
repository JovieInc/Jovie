'use client';

import { ArrowRight, BarChart3, CheckCircle2, Eye, Mail, Shield, Sparkles, Target, TrendingUp, Video } from 'lucide-react';
import Link from 'next/link';

const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/bJe9AS9509EibH46Uf1RC00';

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: Target,
    title: 'We Analyze Your Channel',
    description:
      'Our AI scans your YouTube channel — titles, thumbnails, descriptions, and performance data — to find the biggest opportunities for growth.',
  },
  {
    step: '02',
    icon: Sparkles,
    title: 'AI Optimizes Everything',
    description:
      'We rewrite titles for click-through, optimize descriptions for search, and recommend thumbnail improvements. Every video gets the treatment.',
  },
  {
    step: '03',
    icon: TrendingUp,
    title: 'You Get More Views',
    description:
      'Track your results in a simple email report. See the before/after comparison. If views don\'t increase, you get your money back.',
  },
];

const FEATURES = [
  {
    icon: Video,
    title: 'Title Optimization',
    description: 'AI-rewritten titles that drive higher click-through rates based on what works in your niche.',
  },
  {
    icon: Eye,
    title: 'Thumbnail Analysis',
    description: 'Data-driven recommendations for thumbnails that stop the scroll and drive clicks.',
  },
  {
    icon: BarChart3,
    title: 'Description SEO',
    description: 'Optimized descriptions with the right keywords to rank in YouTube search and suggested videos.',
  },
  {
    icon: Mail,
    title: 'Email Report',
    description: 'Get a clear, actionable report delivered to your inbox. No dashboard to check, no app to install.',
  },
];

const FAQ = [
  {
    question: 'How does the money-back guarantee work?',
    answer:
      'If your channel doesn\'t see a measurable increase in views within 30 days of implementing our recommendations, you get a full refund. No questions asked.',
  },
  {
    question: 'Do I need to install anything?',
    answer:
      'No. Everything is done for you. We send you a detailed email report with specific recommendations for each video. You just implement them.',
  },
  {
    question: 'What if my channel is small?',
    answer:
      'We work with channels of all sizes. Smaller channels often see the biggest percentage gains because there\'s more low-hanging fruit to optimize.',
  },
  {
    question: 'How long does it take?',
    answer:
      'You\'ll receive your optimization report within 24 hours of payment. Implement the recommendations at your own pace.',
  },
  {
    question: 'Is this manual or fully automated?',
    answer:
      'Our AI does the heavy lifting — analyzing your channel, identifying opportunities, and generating recommendations. A human reviews every report for quality.',
  },
];

export function YtOptimizerPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center lg:py-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>AI-Powered YouTube Optimization</span>
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground lg:text-6xl lg:leading-tight">
            Increase Your YouTube Views by{' '}
            <span className="text-primary">30%+</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground lg:text-xl">
            We optimize your titles, thumbnails, and descriptions using AI.
            $30 paid trial. Money-back guarantee if we don&apos;t deliver.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href={STRIPE_PAYMENT_LINK}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get Your Optimization Report — $30
              <ArrowRight className="h-5 w-5" />
            </a>
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" />
              Money-back guarantee
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="h-4 w-4" />
              Delivered via email
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              No app needed
            </span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-b border-border py-20 lg:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Three simple steps to more YouTube views.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="relative rounded-xl border border-border bg-card p-8"
              >
                <div className="mb-4 text-sm font-medium text-muted-foreground">
                  {item.step}
                </div>
                <item.icon className="mb-4 h-8 w-8 text-primary" />
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border py-20 lg:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
              What You Get
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything you need to optimize your channel. Nothing you don&apos;t.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex gap-4 rounded-xl border border-border bg-card p-6"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="mb-1 font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-border py-20 lg:py-28">
        <div className="mx-auto max-w-2xl px-6">
          <div className="rounded-2xl border border-border bg-card p-8 text-center lg:p-12">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              One-Time Payment
            </h2>
            <p className="mt-3 text-muted-foreground">
              No subscriptions. No hidden fees. One payment, one report.
            </p>

            <div className="mt-8">
              <span className="text-5xl font-bold text-foreground">$30</span>
              <span className="ml-2 text-muted-foreground">one-time</span>
            </div>

            <ul className="mt-8 space-y-3 text-left">
              {[
                'Full channel analysis',
                'Title optimization for all videos',
                'Thumbnail improvement recommendations',
                'Description SEO optimization',
                'Delivered via email within 24 hours',
                '30-day money-back guarantee',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <a
              href={STRIPE_PAYMENT_LINK}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get Your Report Now
              <ArrowRight className="h-5 w-5" />
            </a>

            <p className="mt-4 text-sm text-muted-foreground">
              Secure payment via Stripe. Money-back guarantee if views don&apos;t increase.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            Frequently Asked Questions
          </h2>

          <div className="mt-12 space-y-6">
            {FAQ.map((item) => (
              <div
                key={item.question}
                className="rounded-xl border border-border bg-card p-6"
              >
                <h3 className="mb-2 font-semibold text-foreground">
                  {item.question}
                </h3>
                <p className="text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            Ready to Grow Your Channel?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join creators who are using AI to optimize their YouTube presence.
          </p>
          <a
            href={STRIPE_PAYMENT_LINK}
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Your Optimization Report — $30
            <ArrowRight className="h-5 w-5" />
          </a>
        </div>
      </section>
    </main>
  );
}

import { Container } from '@/components/site/Container';
import { ProductScreenshot } from './ProductScreenshot';

interface FeatureRowProps {
  readonly heading: string;
  readonly description: string;
  readonly bullets: string[];
  readonly screenshotSrc: string;
  readonly screenshotAlt: string;
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
}

export function FeatureRow({
  heading,
  description,
  bullets,
  screenshotSrc,
  screenshotAlt,
  screenshotWidth,
  screenshotHeight,
}: FeatureRowProps) {
  return (
    <section className='section-spacing-linear'>
      <Container size='homepage'>
        <div className='mx-auto max-w-[var(--linear-content-max)]'>
          <div className='reveal-on-scroll grid items-center gap-10 lg:grid-cols-2 lg:gap-16'>
            {/* Left: text */}
            <div className='max-w-[480px]'>
              <h2 className='marketing-h2-linear text-primary-token'>
                {heading}
              </h2>
              <p className='marketing-lead-linear mt-4 text-secondary-token'>
                {description}
              </p>
              <ul className='mt-6 flex flex-col gap-3'>
                {bullets.map(bullet => (
                  <li
                    key={bullet}
                    className='flex items-start gap-2.5 text-[15px] leading-[1.6] text-secondary-token'
                  >
                    <span
                      aria-hidden='true'
                      className='mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full'
                      style={{
                        backgroundColor: 'var(--linear-text-tertiary)',
                      }}
                    />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: screenshot */}
            <div className='homepage-surface-card overflow-hidden rounded-[1rem] md:rounded-[1.1rem]'>
              <ProductScreenshot
                src={screenshotSrc}
                alt={screenshotAlt}
                width={screenshotWidth}
                height={screenshotHeight}
                title='Jovie'
                skipCheck
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

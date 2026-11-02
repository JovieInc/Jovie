// @coverage-via apps/web/components/features/demo/DemoHomepageMomentSurface.test.tsx

/**
 * Frames the release-day email (`buildHomepageMomentEmailHtml`) for the
 * `home-release-email` product shot. Takes the HTML as a prop so the frame
 * stays client-safe and storyable.
 */
export function DemoHomepageEmailMoment({ html }: Readonly<{ html: string }>) {
  return (
    <div className='flex min-h-screen items-center justify-center bg-base px-6 py-10'>
      <iframe
        title='Release day email'
        srcDoc={html}
        className='block h-[39rem] w-[31.25rem] [color-scheme:dark]'
        data-testid='homepage-moment-email'
      />
    </div>
  );
}

export function HomepageMeetJovie() {
  return (
    <section
      aria-labelledby='homepage-meet-jovie-heading'
      className='homepage-meet-jovie'
      data-testid='homepage-meet-jovie'
    >
      <div className='homepage-meet-jovie__inner'>
        <h2
          className='homepage-meet-jovie__heading'
          data-homepage-section-heading
          id='homepage-meet-jovie-heading'
        >
          {/* ui-casing-allow: marketing display headline (DESIGN.md Text Casing exception) */}
          <span className='homepage-meet-jovie__heading-primary'>
            Jovie is the AI workspace for artists.
          </span>
          <span className='homepage-meet-jovie__heading-secondary'>
            Built around your artist presence.
          </span>
        </h2>
      </div>
    </section>
  );
}

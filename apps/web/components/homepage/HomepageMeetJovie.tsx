export function HomepageMeetJovie() {
  return (
    <section
      aria-labelledby='homepage-meet-jovie-heading'
      className='homepage-meet-jovie'
      data-testid='homepage-meet-jovie'
    >
      <div className='homepage-meet-jovie__inner'>
        <p className='homepage-meet-jovie__eyebrow'>Meet Jovie</p>
        <h2
          className='homepage-meet-jovie__heading'
          data-homepage-section-heading
          id='homepage-meet-jovie-heading'
        >
          {/* ui-casing-allow: marketing display headline (DESIGN.md Text Casing exception) */}
          Jovie is the AI workspace for artists.
        </h2>
        <p className='homepage-meet-jovie__intro'>
          Built around your catalog, audience, and artist presence.
        </p>
      </div>
    </section>
  );
}

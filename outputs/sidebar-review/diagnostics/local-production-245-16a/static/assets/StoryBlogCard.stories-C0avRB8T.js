import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./marketingStoryMeta-B12ISWnH.js";import{a,n as o}from"./fixtures-B4SU1_HS.js";import{n as s,t as c}from"./StoryBlogCard-DJCQ0gXH.js";var l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{l=t(),a(),n(),s(),{expect:u}=__STORYBOOK_MODULE_TEST__,d={title:`Marketing/Fixtures/StoryBlogCard`,component:c,parameters:{...r,docs:{description:{component:`${i} Production BlogCard rendered with browser-safe deterministic data.`}}},tags:[`autodocs`],args:{post:o[0],variant:`default`}},f={name:`default`,render:e=>(0,l.jsx)(`div`,{className:`mx-auto max-w-md p-8`,children:(0,l.jsx)(c,{...e})})},p={name:`featured`,args:{post:o[0],variant:`featured`},render:e=>(0,l.jsx)(`div`,{className:`mx-auto max-w-3xl p-8`,children:(0,l.jsx)(c,{...e})})},m={render:()=>(0,l.jsx)(`div`,{className:`grid grid-cols-1 gap-12 p-6 md:grid-cols-3`,children:[{slug:`the-suno-playbook-teardown`,title:`The $100K Suno Playbook Is Missing the Hard Part`,date:`2026-07-04`,category:`Music Business`},{slug:`the-contact-problem`,title:`The Contact Problem`,date:`2026-03-18`,category:`Artist Management`},{slug:`the-myspace-problem`,title:`The MySpace Problem`,date:`2025-02-03`,category:`Inbound Marketing`}].map(e=>(0,l.jsx)(c,{post:{...e,author:`Tim White`,excerpt:``,readingTime:0}},e.slug))})},h={render:()=>(0,l.jsx)(`div`,{"data-testid":`title-grid`,className:`grid gap-6 p-6`,children:[`A short title`,`A title that needs a second line in this card`,`A much longer editorial title that must remain complete and readable across several lines without truncating the article name`,`Another short title`,`A brief update`,`More news`].map((e,t)=>(0,l.jsx)(c,{post:{...o[0],slug:`alignment-${t}`,title:e}},e))}),play:async({canvasElement:e})=>{await document.fonts.ready;let t=e.querySelector(`[data-testid="title-grid"]`);if(!t)throw Error(`Title grid missing`);let n=Array.from(t.querySelectorAll(`article`));for(let[e,r]of[[960,3],[660,2],[350,1]]){t.style.width=`${e}px`,t.style.gridTemplateColumns=`repeat(${r}, minmax(0, 1fr))`,await new Promise(e=>requestAnimationFrame(()=>e())),u(t.scrollWidth).toBeLessThanOrEqual(e);let i=n.map(e=>{let t=e.querySelector(`h2`),n=e.querySelector(`time`)?.parentElement;if(!t||!n)throw Error(`Card content missing`);return u(t.scrollHeight).toBeLessThanOrEqual(t.clientHeight),u(getComputedStyle(t).webkitLineClamp).toBe(`none`),u(t.getBoundingClientRect().height).toBeGreaterThan(0),{title:t.getBoundingClientRect().top,metadata:n.getBoundingClientRect().top}});for(let e=0;e<i.length;e+=r){let t=i.slice(e,e+r);u(Math.max(...t.map(e=>e.title))-Math.min(...t.map(e=>e.title))).toBeLessThan(1),u(Math.max(...t.map(e=>e.metadata))-Math.min(...t.map(e=>e.metadata))).toBeLessThan(1)}r===3&&u(i[3].metadata-i[3].title).toBeLessThan(i[0].metadata-i[0].title)}t.style.width=``,t.style.gridTemplateColumns=`repeat(3, minmax(0, 1fr))`}},g=[`Default`,`Featured`,`CanonicalEditorial`,`TitleAlignment`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  name: 'default',
  render: args => <div className='mx-auto max-w-md p-8'>
      <StoryBlogCard {...args} />
    </div>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  name: 'featured',
  args: {
    post: STORY_BLOG_POSTS[0],
    variant: 'featured'
  },
  render: args => <div className='mx-auto max-w-3xl p-8'>
      <StoryBlogCard {...args} />
    </div>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid grid-cols-1 gap-12 p-6 md:grid-cols-3'>
      {[{
      slug: 'the-suno-playbook-teardown',
      title: 'The $100K Suno Playbook Is Missing the Hard Part',
      date: '2026-07-04',
      category: 'Music Business'
    }, {
      slug: 'the-contact-problem',
      title: 'The Contact Problem',
      date: '2026-03-18',
      category: 'Artist Management'
    }, {
      slug: 'the-myspace-problem',
      title: 'The MySpace Problem',
      date: '2025-02-03',
      category: 'Inbound Marketing'
    }].map(post => <StoryBlogCard key={post.slug} post={{
      ...post,
      author: 'Tim White',
      excerpt: '',
      readingTime: 0
    }} />)}
    </div>
}`,...m.parameters?.docs?.source},description:{story:`Published frontmatter plus the canonical O64tu media variants.`,...m.parameters?.docs?.description}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <div data-testid='title-grid' className='grid gap-6 p-6'>
      {['A short title', 'A title that needs a second line in this card', 'A much longer editorial title that must remain complete and readable across several lines without truncating the article name', 'Another short title', 'A brief update', 'More news'].map((title, index) => <StoryBlogCard key={title} post={{
      ...STORY_BLOG_POSTS[0],
      slug: \`alignment-\${index}\`,
      title
    }} />)}
    </div>,
  play: async ({
    canvasElement
  }) => {
    await document.fonts.ready;
    const grid = canvasElement.querySelector<HTMLElement>('[data-testid="title-grid"]');
    if (!grid) throw new Error('Title grid missing');
    const cards = Array.from(grid.querySelectorAll('article'));
    for (const [width, columns] of [[960, 3], [660, 2], [350, 1]]) {
      grid.style.width = \`\${width}px\`;
      grid.style.gridTemplateColumns = \`repeat(\${columns}, minmax(0, 1fr))\`;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      expect(grid.scrollWidth).toBeLessThanOrEqual(width);
      const positions = cards.map(card => {
        const title = card.querySelector('h2');
        const metadata = card.querySelector('time')?.parentElement;
        if (!title || !metadata) throw new Error('Card content missing');
        expect(title.scrollHeight).toBeLessThanOrEqual(title.clientHeight);
        expect(getComputedStyle(title).webkitLineClamp).toBe('none');
        expect(title.getBoundingClientRect().height).toBeGreaterThan(0);
        return {
          title: title.getBoundingClientRect().top,
          metadata: metadata.getBoundingClientRect().top
        };
      });
      for (let start = 0; start < positions.length; start += columns) {
        const row = positions.slice(start, start + columns);
        expect(Math.max(...row.map(p => p.title)) - Math.min(...row.map(p => p.title))).toBeLessThan(1);
        expect(Math.max(...row.map(p => p.metadata)) - Math.min(...row.map(p => p.metadata))).toBeLessThan(1);
      }
      if (columns === 3) {
        // A later short-title row must not inherit the long first row's space.
        expect(positions[3].metadata - positions[3].title).toBeLessThan(positions[0].metadata - positions[0].title);
      }
    }
    grid.style.width = '';
    grid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  }
}`,...h.parameters?.docs?.source},description:{story:`Exercise real browser geometry with independently sized visual rows.`,...h.parameters?.docs?.description}}}})))()}_();export{m as CanonicalEditorial,f as Default,p as Featured,h as TitleAlignment,g as __namedExportsOrder,d as default};
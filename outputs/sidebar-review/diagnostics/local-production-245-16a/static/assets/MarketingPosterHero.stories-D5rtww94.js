import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./MarketingElectricSeam-CyP4xBbb.js";import{n as i,t as a}from"./MarketingPosterHero-NoXhwEK5.js";var o,s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{o=t(),n(),i(),{expect:s,fn:c,userEvent:l}=__STORYBOOK_MODULE_TEST__,u={title:`Marketing/Sections/MarketingPosterHero`,component:a,parameters:{layout:`fullscreen`},play:async({canvasElement:e,args:t})=>{for(let[n,r]of[[`homepage-primary-cta`,t.primaryCta],[`homepage-secondary-cta`,t.secondaryCta]]){if(!r)continue;let t=e.querySelector(`[data-testid="${n}"]`);if(!t)throw Error(`The poster hero must render ${n}.`);await s(t).toHaveAttribute(`href`,r.href),typeof r.label==`string`&&await s(t).toHaveAccessibleName(r.label),t.focus(),await s(t).toHaveFocus();let i=c();t.addEventListener(`click`,e=>{e.preventDefault(),i()},{once:!0}),await l.click(t),await s(i).toHaveBeenCalledOnce()}}},d=`A deliberately long marketing headline that must keep every word available to assistive technology while never painting more than two visual lines at any supported viewport`,f={args:{headline:`Your music. Still moving.`,subtitle:`One focused workspace for every release.`,lede:`Keep your profile, links, and audience signals working together.`,primaryCta:{label:`Get started`,href:`/signup`},secondaryCta:{label:`See artist profiles`,href:`/artist-profiles`},seam:(0,o.jsx)(r,{idSeed:`storybook-poster-seam`}),media:(0,o.jsx)(`div`,{className:`mx-auto min-h-72 w-full max-w-4xl rounded-t-2xl border border-subtle bg-surface-1 p-8 text-secondary-token`,children:`Credible product surface`})}},p={args:{...f.args,headline:d}},m={args:{...f.args,primaryCta:{label:`Get started`,href:`/start`},secondaryCta:{label:`Sign in`,href:`/signin`}}},h={args:{...f.args,primaryCta:{label:`Get started`,href:`/start`,prefetch:!0},secondaryCta:{label:`See pricing`,href:`/pricing`,prefetch:!1}}},g={args:{...f.args,primaryCta:{label:`See pricing`,href:`/pricing`},secondaryCta:{label:`Contact`,href:`/support`}}},_=[`Default`,`OverlongHeadline`,`AuthEntryDestinations`,`ExplicitPrefetchChoices`,`PublicDestinations`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    headline: 'Your music. Still moving.',
    subtitle: 'One focused workspace for every release.',
    lede: 'Keep your profile, links, and audience signals working together.',
    primaryCta: {
      label: 'Get started',
      href: '/signup'
    },
    secondaryCta: {
      label: 'See artist profiles',
      href: '/artist-profiles'
    },
    seam: <MarketingElectricSeam idSeed='storybook-poster-seam' />,
    media: <div className='mx-auto min-h-72 w-full max-w-4xl rounded-t-2xl border border-subtle bg-surface-1 p-8 text-secondary-token'>
        Credible product surface
      </div>
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    headline: LONG_MARKETING_H1_FIXTURE
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    primaryCta: {
      label: 'Get started',
      href: '/start'
    },
    secondaryCta: {
      label: 'Sign in',
      href: '/signin'
    }
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    primaryCta: {
      label: 'Get started',
      href: '/start',
      prefetch: true
    },
    secondaryCta: {
      label: 'See pricing',
      href: '/pricing',
      prefetch: false
    }
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    primaryCta: {
      label: 'See pricing',
      href: '/pricing'
    },
    secondaryCta: {
      label: 'Contact',
      href: '/support'
    }
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{m as AuthEntryDestinations,f as Default,h as ExplicitPrefetchChoices,p as OverlongHeadline,g as PublicDestinations,_ as __namedExportsOrder,u as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";function i({eyebrow:e,title:t,titleId:n,titleClassName:i,description:o,descriptionClassName:s,badges:c,aside:l,className:u,copyClassName:d,asideClassName:f}){return(0,a.jsxs)(`div`,{className:r(`homepage-section-intro`,u),children:[(0,a.jsxs)(`div`,{className:r(`homepage-section-copy`,d),children:[(0,a.jsx)(`p`,{className:`homepage-section-eyebrow`,children:e}),(0,a.jsx)(`h2`,{id:n,className:r(`marketing-h2-linear mt-5 text-primary-token line-clamp-2`,i),children:t}),(0,a.jsx)(`div`,{className:r(`mt-4 max-w-[34rem] text-mid leading-[1.65] text-secondary-token sm:text-base`,s),children:o}),c?.length?(0,a.jsx)(`div`,{className:`mt-5 flex flex-wrap gap-2.5`,children:c.map(e=>(0,a.jsx)(`span`,{"data-testid":e.testId,className:`inline-flex items-center rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-xs font-medium tracking-tight text-secondary-token`,children:e.label},e.label))}):null]}),l?(0,a.jsx)(`div`,{className:f,children:l}):null]})}var a;function o(){return(o=e((()=>{a=t(),n()})))()}var s,c,l,u,d,f;function p(){return(p=e((()=>{s=t(),o(),c={title:`Marketing/Primitives/MarketingSectionIntro`,component:i,parameters:{layout:`fullscreen`},decorators:[e=>(0,s.jsx)(`div`,{className:`bg-base px-6 py-16 text-primary-token`,children:(0,s.jsx)(e,{})})]},l={args:{eyebrow:`Inside Jovie`,title:`Your release work, connected.`,description:`A shared view of releases, profiles, and fan activity so the next useful action is always in reach.`}},u={args:{eyebrow:`The platform`,title:`One profile for every fan.`,titleId:`marketing-section-intro-badges`,description:`Show the next useful release, link, or action without bolting on a separate stack.`,badges:[{label:`Presaves`},{label:`Release day`},{label:`Fan capture`}]}},d={args:{eyebrow:`Fan intelligence`,title:`Know every fan by name.`,description:`Carry source, context, and the next follow-up in the same surface the artist already uses.`,aside:(0,s.jsx)(`div`,{className:`rounded-2xl border border-subtle bg-surface-1 p-6 text-sm text-secondary-token`,children:`Capture intent before release day and convert it into day-one streams.`})}},f=[`Default`,`WithBadges`,`WithAside`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    eyebrow: 'Inside Jovie',
    title: 'Your release work, connected.',
    description: 'A shared view of releases, profiles, and fan activity so the next useful action is always in reach.'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    eyebrow: 'The platform',
    title: 'One profile for every fan.',
    titleId: 'marketing-section-intro-badges',
    description: 'Show the next useful release, link, or action without bolting on a separate stack.',
    badges: [{
      label: 'Presaves'
    }, {
      label: 'Release day'
    }, {
      label: 'Fan capture'
    }]
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    eyebrow: 'Fan intelligence',
    title: 'Know every fan by name.',
    description: 'Carry source, context, and the next follow-up in the same surface the artist already uses.',
    aside: <div className='rounded-2xl border border-subtle bg-surface-1 p-6 text-sm text-secondary-token'>
        Capture intent before release day and convert it into day-one streams.
      </div>
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{l as Default,d as WithAside,u as WithBadges,f as __namedExportsOrder,c as default};
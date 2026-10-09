import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r}from"./penContracts-JeXZpv3H.js";import{n as i,t as a}from"./MarketingContainer-B_bVfqAt.js";import{n as o,t as s}from"./MarketingTerminalCta-Cq4rPvcK.js";import{n as c,t as l}from"./MarketingPageShell-6BRzGJWm.js";import{n as u,t as d}from"./MarketingContentShell-D_WjboKZ.js";import{n as f,t as p}from"./MarketingFooter-PZ3Sxlua.js";import{n as m,t as h}from"./MarketingFooterCta-CDqUqx44.js";import{n as g,t as _}from"./MarketingHeader-YA79N1Oi.js";import{n as v,t as y}from"./PublicPageShell-BkQfPJxe.js";import{i as b,n as x,o as S,t as C}from"./marketingStoryMeta-B12ISWnH.js";import{n as w,t as T}from"./MarketingFinalCTA-gLrVfMLy.js";function E({title:e,body:t}){return(0,D.jsxs)(`div`,{className:`rounded-2xl border border-subtle bg-surface-1 p-8`,children:[(0,D.jsx)(`h2`,{className:`text-xl font-semibold text-primary-token`,children:e}),(0,D.jsx)(`p`,{className:`mt-3 text-sm leading-relaxed text-secondary-token`,children:t})]})}var D,O,k,A,j,M,N,P,F,I,L,R,z,B,V,H,U,W;function G(){return(G=e((()=>{D=t(),i(),u(),w(),f(),m(),g(),o(),v(),r(),c(),x(),O={title:`Marketing/Shells`,parameters:{...b,docs:{description:{component:`${C} Shells own header/footer chrome; sections compose inside them.`}}},tags:[`autodocs`]},k={name:`PublicPageShell`,render:()=>(0,D.jsx)(y,{children:(0,D.jsx)(a,{width:`page`,className:`py-16`,children:(0,D.jsx)(E,{title:`Public Page Shell`,body:`Canonical header, main offset, and footer chrome used by public marketing routes.`})})})},A={name:`MarketingPageShell`,render:()=>(0,D.jsx)(l,{children:(0,D.jsx)(a,{width:`page`,className:`py-16`,children:(0,D.jsx)(E,{title:`Marketing Page Shell`,body:`Minimal relative/grow wrapper used by artist-lp / homepage compositions when PublicPageShell lives in the layout.`})})})},j={name:`MarketingContentShell`,render:()=>(0,D.jsx)(l,{children:(0,D.jsxs)(d,{children:[(0,D.jsx)(`h1`,{className:`text-3xl font-semibold text-primary-token`,children:`About`}),(0,D.jsx)(`p`,{className:`mt-4`,children:`Content shell applies prose-width container and marketing body defaults for long-form pages (about, support, legal-style bodies).`})]})})},M={name:`MarketingContainer/page`,render:()=>(0,D.jsx)(`div`,{className:`bg-base py-12`,children:(0,D.jsx)(a,{width:`page`,children:(0,D.jsx)(E,{title:`Container Width: page`,body:`Canonical public-content max width (max-w-public-content). Prefer page over deprecated landing alias for new work.`})})})},N={name:`MarketingContainer/landing`,render:()=>(0,D.jsx)(`div`,{className:`bg-base py-12`,children:(0,D.jsx)(a,{width:`landing`,children:(0,D.jsx)(E,{title:`Container Width: landing`,body:`Alias of page width retained for call-site compatibility. Same max-w-public-content token.`})})})},P={name:`MarketingContainer/prose`,render:()=>(0,D.jsx)(`div`,{className:`bg-base py-12`,children:(0,D.jsx)(a,{width:`prose`,children:(0,D.jsx)(E,{title:`Container Width: prose`,body:`Canonical prose max width (max-w-prose-canonical / 680px) for long-form reading.`})})})},F={name:`MarketingHeader`,render:()=>(0,D.jsx)(`div`,{className:`bg-base min-h-40`,children:(0,D.jsx)(_,{variant:`landing`})})},I={name:`MarketingFooter`,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(p,{variant:`expanded`,showCta:!1})})},L={name:`MarketingFooterCta`,parameters:S,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(h,{title:`Request Access to Jovie.`,body:`Join the private launch list for presence, relationships, and growth.`})})},R={name:`MarketingFinalCTA`,parameters:S,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(T,{title:`Request private launch access.`,body:`One adaptive profile for every drop.`})})},z={name:`MarketingFinalCTA/secondary`,parameters:S,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(T,{title:`Request private launch access.`,body:`One adaptive profile for every drop.`,secondaryLabel:`See Pricing`,secondaryHref:`/pricing`})})},B={name:`MarketingTerminalCta`,parameters:S,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(s,{title:`A shared terminal call to action.`,ctaLabel:`Request Access`,ctaHref:`/signup`,testId:`storybook-marketing-terminal-cta`,penContractId:n.shell.finalCta})})},V={name:`MarketingTerminalCta/secondary`,parameters:S,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(s,{title:`A shared terminal call to action.`,ctaLabel:`Request Access`,ctaHref:`/signup`,secondaryLabel:`See Pricing`,secondaryHref:`/pricing`,testId:`storybook-marketing-terminal-cta-secondary`,penContractId:n.shell.finalCta})})},H={name:`MarketingTerminalCta/cinematic`,parameters:S,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(s,{variant:`cinematic`,title:`A cinematic terminal call to action.`,ctaLabel:`Request Access`,ctaHref:`/signup`,testId:`storybook-marketing-terminal-cta-cinematic`,penContractId:n.shell.footerCta})})},U={name:`MarketingTerminalCta/cinematic-secondary`,parameters:S,render:()=>(0,D.jsx)(`div`,{className:`bg-base`,children:(0,D.jsx)(s,{variant:`cinematic`,title:`A cinematic terminal call to action.`,ctaLabel:`Request Access`,ctaHref:`/signup`,secondaryLabel:`See Pricing`,secondaryHref:`/pricing`,testId:`storybook-marketing-terminal-cta-cinematic-secondary`,penContractId:n.shell.footerCta})})},W=[`PublicPageShellDefault`,`MarketingPageShellDefault`,`MarketingContentShellDefault`,`MarketingContainerPage`,`MarketingContainerLanding`,`MarketingContainerProse`,`MarketingHeaderDefault`,`MarketingFooterDefault`,`MarketingFooterCtaDefault`,`MarketingFinalCtaDefault`,`MarketingFinalCtaWithSecondary`,`MarketingTerminalCtaDefault`,`MarketingTerminalCtaWithSecondary`,`MarketingTerminalCtaCinematic`,`MarketingTerminalCtaCinematicWithSecondary`],k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  name: 'PublicPageShell',
  render: () => <PublicPageShell>
      <MarketingContainer width='page' className='py-16'>
        <ShellDemoBlock title='Public Page Shell' body='Canonical header, main offset, and footer chrome used by public marketing routes.' />
      </MarketingContainer>
    </PublicPageShell>
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  name: 'MarketingPageShell',
  render: () => <MarketingPageShell>
      <MarketingContainer width='page' className='py-16'>
        <ShellDemoBlock title='Marketing Page Shell' body='Minimal relative/grow wrapper used by artist-lp / homepage compositions when PublicPageShell lives in the layout.' />
      </MarketingContainer>
    </MarketingPageShell>
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  name: 'MarketingContentShell',
  render: () => <MarketingPageShell>
      <MarketingContentShell>
        <h1 className='text-3xl font-semibold text-primary-token'>About</h1>
        <p className='mt-4'>
          Content shell applies prose-width container and marketing body
          defaults for long-form pages (about, support, legal-style bodies).
        </p>
      </MarketingContentShell>
    </MarketingPageShell>
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  name: 'MarketingContainer/page',
  render: () => <div className='bg-base py-12'>
      <MarketingContainer width='page'>
        <ShellDemoBlock title='Container Width: page' body='Canonical public-content max width (max-w-public-content). Prefer page over deprecated landing alias for new work.' />
      </MarketingContainer>
    </div>
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  name: 'MarketingContainer/landing',
  render: () => <div className='bg-base py-12'>
      <MarketingContainer width='landing'>
        <ShellDemoBlock title='Container Width: landing' body='Alias of page width retained for call-site compatibility. Same max-w-public-content token.' />
      </MarketingContainer>
    </div>
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  name: 'MarketingContainer/prose',
  render: () => <div className='bg-base py-12'>
      <MarketingContainer width='prose'>
        <ShellDemoBlock title='Container Width: prose' body='Canonical prose max width (max-w-prose-canonical / 680px) for long-form reading.' />
      </MarketingContainer>
    </div>
}`,...P.parameters?.docs?.source}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  name: 'MarketingHeader',
  render: () => <div className='bg-base min-h-40'>
      <MarketingHeader variant='landing' />
    </div>
}`,...F.parameters?.docs?.source}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  name: 'MarketingFooter',
  render: () => <div className='bg-base'>
      <MarketingFooter variant='expanded' showCta={false} />
    </div>
}`,...I.parameters?.docs?.source}}},L.parameters={...L.parameters,docs:{...L.parameters?.docs,source:{originalSource:`{
  name: 'MarketingFooterCta',
  parameters: terminalCtaStoryParameters,
  render: () => <div className='bg-base'>
      <MarketingFooterCta title='Request Access to Jovie.' body='Join the private launch list for presence, relationships, and growth.' />
    </div>
}`,...L.parameters?.docs?.source}}},R.parameters={...R.parameters,docs:{...R.parameters?.docs,source:{originalSource:`{
  name: 'MarketingFinalCTA',
  parameters: terminalCtaStoryParameters,
  render: () => <div className='bg-base'>
      <MarketingFinalCTA title='Request private launch access.' body='One adaptive profile for every drop.' />
    </div>
}`,...R.parameters?.docs?.source}}},z.parameters={...z.parameters,docs:{...z.parameters?.docs,source:{originalSource:`{
  name: 'MarketingFinalCTA/secondary',
  parameters: terminalCtaStoryParameters,
  render: () => <div className='bg-base'>
      <MarketingFinalCTA title='Request private launch access.' body='One adaptive profile for every drop.' secondaryLabel='See Pricing' secondaryHref='/pricing' />
    </div>
}`,...z.parameters?.docs?.source}}},B.parameters={...B.parameters,docs:{...B.parameters?.docs,source:{originalSource:`{
  name: 'MarketingTerminalCta',
  parameters: terminalCtaStoryParameters,
  render: () => <div className='bg-base'>
      <MarketingTerminalCta title='A shared terminal call to action.' ctaLabel='Request Access' ctaHref='/signup' testId='storybook-marketing-terminal-cta' penContractId={MARKETING_PEN_CONTRACT_IDS.shell.finalCta} />
    </div>
}`,...B.parameters?.docs?.source}}},V.parameters={...V.parameters,docs:{...V.parameters?.docs,source:{originalSource:`{
  name: 'MarketingTerminalCta/secondary',
  parameters: terminalCtaStoryParameters,
  render: () => <div className='bg-base'>
      <MarketingTerminalCta title='A shared terminal call to action.' ctaLabel='Request Access' ctaHref='/signup' secondaryLabel='See Pricing' secondaryHref='/pricing' testId='storybook-marketing-terminal-cta-secondary' penContractId={MARKETING_PEN_CONTRACT_IDS.shell.finalCta} />
    </div>
}`,...V.parameters?.docs?.source}}},H.parameters={...H.parameters,docs:{...H.parameters?.docs,source:{originalSource:`{
  name: 'MarketingTerminalCta/cinematic',
  parameters: terminalCtaStoryParameters,
  render: () => <div className='bg-base'>
      <MarketingTerminalCta variant='cinematic' title='A cinematic terminal call to action.' ctaLabel='Request Access' ctaHref='/signup' testId='storybook-marketing-terminal-cta-cinematic' penContractId={MARKETING_PEN_CONTRACT_IDS.shell.footerCta} />
    </div>
}`,...H.parameters?.docs?.source}}},U.parameters={...U.parameters,docs:{...U.parameters?.docs,source:{originalSource:`{
  name: 'MarketingTerminalCta/cinematic-secondary',
  parameters: terminalCtaStoryParameters,
  render: () => <div className='bg-base'>
      <MarketingTerminalCta variant='cinematic' title='A cinematic terminal call to action.' ctaLabel='Request Access' ctaHref='/signup' secondaryLabel='See Pricing' secondaryHref='/pricing' testId='storybook-marketing-terminal-cta-cinematic-secondary' penContractId={MARKETING_PEN_CONTRACT_IDS.shell.footerCta} />
    </div>
}`,...U.parameters?.docs?.source}}}})))()}G();export{N as MarketingContainerLanding,M as MarketingContainerPage,P as MarketingContainerProse,j as MarketingContentShellDefault,R as MarketingFinalCtaDefault,z as MarketingFinalCtaWithSecondary,L as MarketingFooterCtaDefault,I as MarketingFooterDefault,F as MarketingHeaderDefault,A as MarketingPageShellDefault,H as MarketingTerminalCtaCinematic,U as MarketingTerminalCtaCinematicWithSecondary,B as MarketingTerminalCtaDefault,V as MarketingTerminalCtaWithSecondary,k as PublicPageShellDefault,W as __namedExportsOrder,O as default};
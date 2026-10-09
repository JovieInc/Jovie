import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r}from"./DspLogo-DW57EStE.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),r(),a=[[`spotify`,`Spotify`],[`apple_music`,`Apple Music`],[`youtube`,`YouTube`],[`tidal`,`TIDAL`]],o={title:`Atoms/DspLogo`,component:n,parameters:{layout:`centered`},args:{provider:`spotify`,height:20}},s={},c={render:()=>(0,i.jsxs)(`fieldset`,{className:`flex flex-wrap items-center gap-4`,children:[(0,i.jsx)(`legend`,{className:`sr-only`,children:`Featured DSP logos`}),a.map(([e,t])=>(0,i.jsxs)(`div`,{className:`min-w-24`,children:[(0,i.jsx)(n,{height:20,provider:e}),(0,i.jsx)(`span`,{className:`sr-only`,children:t})]},e))]})},l={args:{provider:`apple_music`,height:24}},u={args:{provider:`tiktok`,className:`text-primary-token`}},d={args:{height:32,provider:`spotify`}},f={args:{provider:`amazon`}},p=[`Default`,`Providers`,`AppleMusic`,`TikTok`,`Tall`,`UnmappedProvider`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <fieldset className='flex flex-wrap items-center gap-4'>
      <legend className='sr-only'>Featured DSP logos</legend>
      {FEATURED_PROVIDERS.map(([provider, label]) => <div className='min-w-24' key={provider}>
          <DspLogo height={20} provider={provider} />
          <span className='sr-only'>{label}</span>
        </div>)}
    </fieldset>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    provider: 'apple_music',
    height: 24
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    provider: 'tiktok',
    className: 'text-primary-token'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    height: 32,
    provider: 'spotify'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    provider: 'amazon'
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{l as AppleMusic,s as Default,c as Providers,d as Tall,u as TikTok,f as UnmappedProvider,p as __namedExportsOrder,o as default};
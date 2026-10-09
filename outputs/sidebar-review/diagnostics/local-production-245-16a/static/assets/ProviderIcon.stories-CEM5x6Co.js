import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ProviderIcon-1Oh7oGQq.js";var i,a,o,s,c,l,u;function d(){return(d=e((()=>{i=t(),n(),a={title:`Atoms/ProviderIcon`,component:r,parameters:{layout:`centered`},args:{provider:`spotify`}},o={},s=[`spotify`,`apple_music`,`youtube_music`,`soundcloud`,`tidal`,`deezer`],c={name:`DSP row`,render:()=>(0,i.jsxs)(`fieldset`,{className:`flex items-center gap-4`,children:[(0,i.jsx)(`legend`,{className:`sr-only`,children:`Streaming providers`}),s.map(e=>(0,i.jsx)(r,{provider:e,className:`h-6 w-6`,"aria-label":e},e))]})},l={name:`Unknown provider (fallback)`,args:{provider:`unknown-provider`,"aria-label":`Unknown provider`}},u=[`Default`,`DSPRow`,`UnknownProvider`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  name: 'DSP row',
  render: () => <fieldset className='flex items-center gap-4'>
      <legend className='sr-only'>Streaming providers</legend>
      {DSP_PROVIDERS.map(provider => <ProviderIcon key={provider} provider={provider} className='h-6 w-6' aria-label={provider} />)}
    </fieldset>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  name: 'Unknown provider (fallback)',
  args: {
    // @ts-expect-error — exercising the not-found fallback path.
    provider: 'unknown-provider',
    'aria-label': 'Unknown provider'
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as DSPRow,o as Default,l as UnknownProvider,u as __namedExportsOrder,a as default};
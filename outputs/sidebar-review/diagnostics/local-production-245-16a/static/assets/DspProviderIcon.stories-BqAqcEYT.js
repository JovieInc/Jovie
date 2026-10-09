import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,o as r}from"./SocialIcon-B36VBlYO.js";import{i,t as a}from"./DspProviderIcon-7OrlHn_W.js";var o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{o=t(),r(),i(),s={title:`Dashboard/Atoms/DspProviderIcon`,component:a,parameters:{layout:`centered`},args:{provider:`spotify`,size:`md`},argTypes:{provider:{control:`select`,options:n},size:{control:`select`,options:[`sm`,`md`,`lg`]}}},c={},l={args:{showLabel:!0}},u={args:{size:`lg`,showLabel:!0}},d={args:{provider:`genius`,showLabel:!0}},f={render:e=>(0,o.jsx)(`div`,{className:`flex flex-wrap items-center gap-4`,children:n.map(t=>(0,o.jsx)(a,{...e,provider:t,showLabel:!0},t))})},p=[`Default`,`WithLabel`,`Large`,`NonStreamingProvider`,`AllProviders`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    showLabel: true
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'lg',
    showLabel: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    provider: 'genius',
    showLabel: true
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: args => <div className='flex flex-wrap items-center gap-4'>
      {DSP_PROVIDER_IDS.map(provider => <DspProviderIcon key={provider} {...args} provider={provider} showLabel />)}
    </div>
}`,...f.parameters?.docs?.source}}}})))()}m();export{f as AllProviders,c as Default,u as Large,d as NonStreamingProvider,l as WithLabel,p as __namedExportsOrder,s as default};
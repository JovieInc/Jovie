import{n as e,s as t}from"./rolldown-runtime-BcKkbAw3.js";import{t as n}from"./react-CFeKwT_a.js";import{t as r}from"./jsx-runtime-BbDfbRii.js";import{n as i,t as a}from"./SettingsPaymentsSection-CeS9pYzT.js";function o(e,t){return(n,r)=>(typeof n==`string`?n:n.toString()).includes(`/api/stripe-connect/status`)?Promise.resolve(new Response(JSON.stringify(e),{status:200})):t(n,r)}function s({children:e,status:t}){let n=l.useRef(null);return l.useLayoutEffect(()=>(n.current=globalThis.fetch,globalThis.fetch=o(t,globalThis.fetch),()=>{n.current&&(globalThis.fetch=n.current)}),[t]),(0,c.jsx)(c.Fragment,{children:e})}var c,l,u,d,f,p;function m(){return(m=e((()=>{c=r(),l=t(n()),i(),u={title:`Dashboard/Organisms/SettingsPaymentsSection`,component:a,parameters:{layout:`padded`},decorators:[e=>(0,c.jsx)(`div`,{className:`max-w-2xl`,children:(0,c.jsx)(e,{})})]},d={decorators:[e=>(0,c.jsx)(s,{status:{connected:!0,onboardingComplete:!0,payoutsEnabled:!0,email:`artist@example.com`},children:(0,c.jsx)(e,{})})]},f={decorators:[e=>(0,c.jsx)(s,{status:{connected:!1,onboardingComplete:!1,payoutsEnabled:!1,email:null,onboardingAvailable:!1},children:(0,c.jsx)(e,{})})]},p=[`Connected`,`PlatformProfileUnavailable`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithStripeStatus status={{
    connected: true,
    onboardingComplete: true,
    payoutsEnabled: true,
    email: 'artist@example.com'
  }}>
        <Story />
      </WithStripeStatus>]
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithStripeStatus status={{
    connected: false,
    onboardingComplete: false,
    payoutsEnabled: false,
    email: null,
    onboardingAvailable: false
  }}>
        <Story />
      </WithStripeStatus>]
}`,...f.parameters?.docs?.source}}}})))()}m();export{d as Connected,f as PlatformProfileUnavailable,p as __namedExportsOrder,u as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./inline-offline-CwvBzRW9.js";var i,a,o,s,c,l;function u(){return(u=e((()=>{i=t(),n(),a={title:`shadcn/InlineOffline`,component:r,parameters:{layout:`padded`,docs:{description:{component:`Inline offline/retry pattern for data-backed blocks. Uses data-state="offline" with warning surface tokens.`}}},tags:[`autodocs`]},o={args:{onRetry:()=>void 0},decorators:[e=>(0,i.jsx)(`div`,{className:`max-w-md`,children:(0,i.jsx)(e,{})})]},s={args:{message:`Offline — showing cached audience stats.`},decorators:[e=>(0,i.jsx)(`div`,{className:`max-w-md`,children:(0,i.jsx)(e,{})})]},c={args:{message:`You are offline. Cached audience data remains available, and pending changes will sync automatically when the connection returns.`,retryLabel:`Try again`,onRetry:()=>void 0},decorators:[e=>(0,i.jsx)(`div`,{className:`w-64`,children:(0,i.jsx)(e,{})})],parameters:{viewport:{defaultViewport:`mobile1`}}},l=[`Default`,`WithoutRetry`,`NarrowLongMessage`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    onRetry: () => undefined
  },
  decorators: [Story => <div className='max-w-md'>
        <Story />
      </div>]
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    message: 'Offline — showing cached audience stats.'
  },
  decorators: [Story => <div className='max-w-md'>
        <Story />
      </div>]
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    message: 'You are offline. Cached audience data remains available, and pending changes will sync automatically when the connection returns.',
    retryLabel: 'Try again',
    onRetry: () => undefined
  },
  decorators: [Story => <div className='w-64'>
        <Story />
      </div>],
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...c.parameters?.docs?.source}}}})))()}u();export{o as Default,c as NarrowLongMessage,s as WithoutRetry,l as __namedExportsOrder,a as default};
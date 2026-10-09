import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./PageErrorState-C674AFVN.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={title:`Feedback/PageErrorState`,component:r,parameters:{layout:`fullscreen`},decorators:[e=>(0,i.jsx)(`div`,{className:`flex min-h-screen`,children:(0,i.jsx)(e,{})})]},s=Object.assign(Error(`The dashboard request timed out.`),{digest:`dashboard-timeout`}),c={args:{title:`Unable to Load Dashboard`,message:`Try again in a moment.`,error:s,onRetry:a()}},l={args:c.args,parameters:{viewport:{defaultViewport:`mobile1`}}},u={args:{title:`Unable to Load Dashboard`,message:`Try again in a moment.`,error:Object.assign(Error(`The dashboard request exceeded its timeout while loading profile, audience, release, and analytics data. Please retry after checking your connection.`),{digest:`dashboard-long-error`}),onRetry:a()}},d=[`DashboardFatalErrorDesktop`,`DashboardFatalErrorMobile`,`LongErrorDetails`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Unable to Load Dashboard',
    message: 'Try again in a moment.',
    error,
    onRetry: fn()
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: DashboardFatalErrorDesktop.args,
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Unable to Load Dashboard',
    message: 'Try again in a moment.',
    error: Object.assign(new Error('The dashboard request exceeded its timeout while loading profile, audience, release, and analytics data. Please retry after checking your connection.'), {
      digest: 'dashboard-long-error'
    }),
    onRetry: fn()
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{c as DashboardFatalErrorDesktop,l as DashboardFatalErrorMobile,u as LongErrorDetails,d as __namedExportsOrder,o as default};
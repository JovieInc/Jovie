import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./OnboardingMessageRecoveryRow-BGgjT4FL.js";var r,i,a,o,s,c;function l(){return(l=e((()=>{t(),r={title:`Features/Onboarding/Message Recovery Row`,component:n,parameters:{layout:`centered`,jovie:{uncoveredProps:[`disabled`]}}},i={args:{chatError:{type:`rate_limit`,message:`Too many anonymous chat requests from this IP. Please sign up to continue.`,retryAfter:45},handleRetry:()=>{},isBusy:!1,isSubmitted:!1}},a={args:{chatError:{type:`server`,message:`Something went wrong while sending your message.`,failedMessage:`hello`},handleRetry:()=>{},isBusy:!1,isSubmitted:!1}},o={args:{chatError:{type:`server`,message:`Something went wrong while sending your message.`,failedMessage:`hello`},handleRetry:()=>{},isBusy:!0,isSubmitted:!1}},s={args:{chatError:{type:`server`,message:`Something went wrong while sending your message.`,failedMessage:`hello`},handleRetry:()=>{},isBusy:!1,isSubmitted:!0}},c=[`RateLimited`,`RetryableServer`,`Busy`,`Submitted`],i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  args: {
    chatError: {
      type: 'rate_limit',
      message: 'Too many anonymous chat requests from this IP. Please sign up to continue.',
      retryAfter: 45
    },
    handleRetry: () => {},
    isBusy: false,
    isSubmitted: false
  }
}`,...i.parameters?.docs?.source}}},a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    chatError: {
      type: 'server',
      message: 'Something went wrong while sending your message.',
      failedMessage: 'hello'
    },
    handleRetry: () => {},
    isBusy: false,
    isSubmitted: false
  }
}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    chatError: {
      type: 'server',
      message: 'Something went wrong while sending your message.',
      failedMessage: 'hello'
    },
    handleRetry: () => {},
    isBusy: true,
    isSubmitted: false
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    chatError: {
      type: 'server',
      message: 'Something went wrong while sending your message.',
      failedMessage: 'hello'
    },
    handleRetry: () => {},
    isBusy: false,
    isSubmitted: true
  }
}`,...s.parameters?.docs?.source}}}})))()}l();export{o as Busy,i as RateLimited,a as RetryableServer,s as Submitted,c as __namedExportsOrder,r as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./OnboardingShell-CI3Fi65A.js";var r,i,a,o,s,c;function l(){return(l=e((()=>{t(),{expect:r,within:i}=__STORYBOOK_MODULE_TEST__,a={title:`Features/Onboarding/OnboardingShell`,component:n,parameters:{layout:`fullscreen`,chromatic:{viewports:[390,1024]},docs:{description:{component:`The /start entry shell before and after authentication. A verified account keeps the chat but no longer sees a Sign in link.`}}},args:{sessionLabel:`story`,isSignedIn:!1}},o={play:async({canvasElement:e})=>{let t=i(e);await r(t.getByRole(`link`,{name:`Sign in`})).toBeVisible()}},s={args:{isSignedIn:!0},play:async({canvasElement:e})=>{let t=i(e);await r(t.queryByRole(`link`,{name:`Sign in`})).toBeNull()}},c=[`Visitor`,`SignedIn`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', {
      name: 'Sign in'
    })).toBeVisible();
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    isSignedIn: true
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', {
      name: 'Sign in'
    })).toBeNull();
  }
}`,...s.parameters?.docs?.source}}}})))()}l();export{s as SignedIn,o as Visitor,c as __namedExportsOrder,a as default};
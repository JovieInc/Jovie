import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./LandingCTAButton-8OF1qq5Y.js";var r,i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{t(),{expect:r,fn:i,userEvent:a}=__STORYBOOK_MODULE_TEST__,o={title:`Marketing/Actions/LandingCTAButton`,component:n,parameters:{layout:`centered`,docs:{description:{component:`Existing landing action: auth destinations wait for navigation, public destinations retain Next Link defaults, and clicks retain hero analytics. This component does not expose an explicit prefetch override.`}}},args:{href:`/start`,label:`Get started`,eventName:`landing_cta_contract`,section:`hero`},play:async({canvasElement:e,args:t})=>{let n=e.querySelector(`a`);if(await r(n).toBeInTheDocument(),!n)throw Error(`The landing action must render its actual link.`);await r(n).toHaveAttribute(`href`,t.href),await r(n).toHaveAccessibleName(t.label),n.focus(),await r(n).toHaveFocus();let o=i();n.addEventListener(`click`,e=>{e.preventDefault(),o()},{once:!0}),await a.click(n),await r(o).toHaveBeenCalledOnce()}},s={},c={args:{href:`/signup`,label:`Request access`}},l={args:{href:`/signin`,label:`Sign in`}},u={args:{href:`/pricing`,label:`See pricing`}},d={args:{href:`/support`,label:`Talk to the team`,variant:`text`}},f=[`Start`,`Signup`,`SignIn`,`PublicPricing`,`PublicText`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    href: '/signup',
    label: 'Request access'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    href: '/signin',
    label: 'Sign in'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    href: '/pricing',
    label: 'See pricing'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    href: '/support',
    label: 'Talk to the team',
    variant: 'text'
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{u as PublicPricing,d as PublicText,l as SignIn,c as Signup,s as Start,f as __namedExportsOrder,o as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{n as i,t as a}from"./OnboardingExperienceShell-Dr-FKLZH.js";function o({label:e}){return(0,u.jsxs)(`div`,{className:`space-y-3`,children:[(0,u.jsx)(`h1`,{className:`text-2xl font-semibold tracking-tight text-primary-token`,children:e}),(0,u.jsx)(`p`,{className:`text-sm text-secondary-token`,children:`Onboarding stage framing fixture. Shared radius and padding stay owned by one recipe; variant fills remain distinct.`})]})}function s(){return(0,u.jsx)(`nav`,{"aria-label":`Onboarding Steps`,children:(0,u.jsxs)(`ul`,{className:`space-y-1.5`,children:[(0,u.jsx)(`li`,{className:`text-sm font-semibold text-primary-token`,children:`Handle`}),(0,u.jsx)(`li`,{className:`text-sm text-secondary-token`,children:`Spotify`})]})})}function c(){return(0,u.jsxs)(`div`,{className:`space-y-4`,children:[(0,u.jsx)(`h1`,{className:`text-2xl font-semibold tracking-tight text-primary-token`,children:`Continue setup`}),(0,u.jsx)(r,{type:`button`,children:`Continue`})]})}function l(){return(0,u.jsx)(`div`,{className:`space-y-4`,"data-testid":`onboarding-stage-overflow-copy`,children:m.map(e=>(0,u.jsxs)(`p`,{className:`text-sm text-secondary-token`,children:[`Overflow `,e,` row. The stage keeps its shared radius and padding while content grows past the reserved height.`]},e))})}var u,d,f,p,m,h,g,_,v,y,b,x,S,C;function w(){return(w=e((()=>{u=t(),n(),i(),{expect:d,userEvent:f,within:p}=__STORYBOOK_MODULE_TEST__,m=[`first`,`second`,`third`,`fourth`,`fifth`,`sixth`,`seventh`,`eighth`,`ninth`,`tenth`,`eleventh`,`twelfth`],h={title:`Onboarding/ExperienceShell`,component:a,parameters:{layout:`fullscreen`,chromatic:{viewports:[390,1024]},docs:{description:{component:`Deterministic onboarding stage variants. Storybook preview freezes motion and prefers-reduced-motion, so every story is the static reduced-motion state. Desktop and mobile Chromatic viewports cover the stacked sidebar layout.`}}},args:{mode:`standalone`,sidebar:(0,u.jsx)(s,{}),sidebarTitle:`Jovie Setup`,children:(0,u.jsx)(o,{label:`Claim your handle`})}},g={args:{stageVariant:`framed`,visualVariant:`default`}},_={args:{stageVariant:`flat`,visualVariant:`default`}},v={args:{stageVariant:`flat`,visualVariant:`v1`}},y={args:{stageVariant:`framed`,visualVariant:`default`},parameters:{backgrounds:{default:`light`}}},b={args:{stageVariant:`framed`,visualVariant:`default`,children:(0,u.jsx)(c,{})},play:async({canvasElement:e})=>{let t=p(e).getByRole(`button`,{name:`Continue`});await f.click(t),t.focus(),await d(t).toHaveFocus()}},x={args:{stageVariant:`framed`,visualVariant:`default`,children:(0,u.jsx)(l,{})}},S={args:{stageVariant:`framed`,visualVariant:`default`},parameters:{docs:{description:{story:`prefers-reduced-motion is forced by the Storybook preview fixture. This story is the static framed stage with animations paused.`}}}},C=[`Framed`,`Flat`,`V1`,`Light`,`Focus`,`Overflow`,`ReducedMotion`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    stageVariant: 'framed',
    visualVariant: 'default'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    stageVariant: 'flat',
    visualVariant: 'default'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    stageVariant: 'flat',
    visualVariant: 'v1'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    stageVariant: 'framed',
    visualVariant: 'default'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    stageVariant: 'framed',
    visualVariant: 'default',
    children: <FocusCopy />
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', {
      name: 'Continue'
    });
    await userEvent.click(button);
    button.focus();
    await expect(button).toHaveFocus();
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    stageVariant: 'framed',
    visualVariant: 'default',
    children: <OverflowCopy />
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    stageVariant: 'framed',
    visualVariant: 'default'
  },
  parameters: {
    docs: {
      description: {
        story: 'prefers-reduced-motion is forced by the Storybook preview fixture. This story is the static framed stage with animations paused.'
      }
    }
  }
}`,...S.parameters?.docs?.source}}}})))()}w();export{_ as Flat,b as Focus,g as Framed,y as Light,x as Overflow,S as ReducedMotion,v as V1,C as __namedExportsOrder,h as default};
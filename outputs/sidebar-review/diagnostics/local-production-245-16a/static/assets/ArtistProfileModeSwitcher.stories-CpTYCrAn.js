import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ArtistProfileModeSwitcher-B2a9ZNH9.js";import{n as i,t as a}from"./artistProfileCopy-j-Y_pNlk.js";var o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{o=t(),i(),n(),{expect:s,userEvent:c,waitFor:l,within:u}=__STORYBOOK_MODULE_TEST__,d={title:`Marketing/Artist Profile/ArtistProfileModeSwitcher`,component:r,parameters:{layout:`fullscreen`},decorators:[e=>(0,o.jsx)(`div`,{className:`bg-surface-0 px-6 py-16 text-primary-token`,children:(0,o.jsx)(e,{})})],args:{adaptive:a.adaptive,phoneCaption:`Live artist profile`,phoneSubcaption:`Adaptive action path preview`,showIntroHeading:!0}},f={args:{adaptive:a.adaptive,phoneCaption:`Live artist profile`,phoneSubcaption:`Adaptive action path preview`,showIntroHeading:!0}},p={args:{adaptive:a.adaptive,phoneCaption:`Profile preview`,phoneSubcaption:`Release, video, shows, and shop modes`,showIntroHeading:!1}},m={play:async({canvasElement:e})=>{let t=u(e).getByRole(`tab`,{name:`Out now`});await l(()=>s(t).toBeEnabled()),await c.click(t),await s(t).toHaveAttribute(`aria-selected`,`true`)}},h=[`Intro`,`Compact`,`Readiness`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: 'Live artist profile',
    phoneSubcaption: 'Adaptive action path preview',
    showIntroHeading: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: 'Profile preview',
    phoneSubcaption: 'Release, video, shows, and shop modes',
    showIntroHeading: false
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const choice = canvas.getByRole('tab', {
      name: 'Out now'
    });
    await waitFor(() => expect(choice).toBeEnabled());
    await userEvent.click(choice);
    await expect(choice).toHaveAttribute('aria-selected', 'true');
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{p as Compact,f as Intro,m as Readiness,h as __namedExportsOrder,d as default};
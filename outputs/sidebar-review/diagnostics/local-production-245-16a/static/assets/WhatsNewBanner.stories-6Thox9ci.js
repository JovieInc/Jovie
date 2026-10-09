import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./button-BSHhPV4e.js";import{n as a,t as o}from"./input-BYNkmjMu.js";import{a as s,n as c,r as l,t as u}from"./WhatsNewBanner-C2e6nInh.js";function d(){let[e,t]=(0,p.useState)(!0),[n,r]=(0,p.useState)(!1);return(0,f.jsxs)(f.Fragment,{children:[(0,f.jsx)(o,{"aria-label":`Draft`,defaultValue:`Keep this draft`}),(0,f.jsx)(i,{size:`sm`,"data-rail-toggle":`left`,onClick:()=>r(e=>!e),children:`Sidebar`}),(0,f.jsx)(i,{size:`sm`,onClick:()=>t(e=>!e),children:e?`Disable updates`:`Enable updates`}),(0,f.jsx)(u,{enabled:e,collapsed:n,fetchImpl:x})]})}var f,p,m,h,g,_,v,y,b,x,S,C;function w(){return(w=e((()=>{f=n(),r(),a(),p=t(),s(),l(),{fn:m}=__STORYBOOK_MODULE_TEST__,h={id:`26.9.2`,title:`Chat is home`,date:`2026-09-26`,summary:`Ask Jovie is the first signed-in surface, with the library a swipe away.`,url:`https://jov.ie/changelog/26.9.2`,highlights:[`Library filters`,`Lighter button labels`],dogfood:[`Open chat and ask about your latest release`]},g={title:`Organisms/WhatsNewBanner`,component:c,parameters:{layout:`fullscreen`,jovie:{uncoveredProps:[`enabled`]}},decorators:[e=>(0,f.jsx)(`div`,{className:`flex h-screen flex-col justify-end border-r border-(--app-shell-border) bg-base pb-12`,style:{width:`var(--app-shell-sidebar-width)`},children:(0,f.jsx)(e,{})})],args:{onOpen:m(),onDismiss:m()}},_={args:{unseen:{entry:h,unseenCount:1,href:h.url}}},v={..._,parameters:{themes:{themeOverride:`light`}}},y={args:{unseen:{entry:h,unseenCount:3,href:`https://jov.ie/changelog`}}},b={args:{unseen:{entry:{...h,title:`Library is one catalog with Ideas, In Progress, and Out across every release type`},unseenCount:1,href:h.url}}},x=async e=>Response.json(String(e)===`/api/whats-new`?null:{version:1,changelogUrl:`https://jov.ie/changelog`,entries:[h]}),S={render:()=>(0,f.jsx)(d,{})},C=[`SingleUpdate`,`SingleUpdateLight`,`MultipleUpdates`,`LongTitle`,`ActualContainer`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    unseen: {
      entry: ENTRY,
      unseenCount: 1,
      href: ENTRY.url
    }
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  ...SingleUpdate,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    unseen: {
      entry: ENTRY,
      unseenCount: 3,
      href: 'https://jov.ie/changelog'
    }
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    unseen: {
      entry: {
        ...ENTRY,
        title: 'Library is one catalog with Ideas, In Progress, and Out across every release type'
      },
      unseenCount: 1,
      href: ENTRY.url
    }
  }
}`,...b.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  render: () => <ActualContainerFixture />
}`,...S.parameters?.docs?.source},description:{story:`Actual loading/dismissal owner, independent of shell IS_E2E suppression.`,...S.parameters?.docs?.description}}}})))()}w();export{S as ActualContainer,b as LongTitle,y as MultipleUpdates,_ as SingleUpdate,v as SingleUpdateLight,C as __namedExportsOrder,g as default};
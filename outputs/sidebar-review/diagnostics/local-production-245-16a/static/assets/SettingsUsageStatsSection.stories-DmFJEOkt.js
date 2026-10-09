import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{H as r,U as i}from"./removable-_8fTgXVw.js";import{c as a,s as o}from"./iframe-B1b4EUuv.js";import{n as s,t as c}from"./keys-CNuKOgyu.js";import"./system-b-app-0raEe-jZ.js";import{n as l,t as u}from"./SettingsUsageStatsSection-DYUb4Xxz.js";function d({children:e,usage:t,mode:n=`ready`}){let[i]=(0,p.useState)(()=>{let e=new o({defaultOptions:{queries:{retry:!1,staleTime:1/0,refetchOnMount:!1,retryOnMount:!1,refetchOnWindowFocus:!1}}});return n===`error`||n===`failed-retry`?e.getQueryCache().build(e,{queryKey:s.chat.usage()}).setState({data:void 0,error:Error(`Usage unavailable`),status:`error`,fetchStatus:`idle`}):n===`ready`&&e.setQueryData(s.chat.usage(),t),e});return(0,p.useLayoutEffect)(()=>{let e=window,r=e.__jovieApiMock;return e.__jovieApiMock=e=>e.url.pathname===`/api/chat/usage`?n===`loading`?new Promise(()=>void 0):n===`failed-retry`?Response.json({error:`Usage unavailable`},{status:503}):Response.json(t):r?.(e),()=>{e.__jovieApiMock=r}},[n,t]),(0,f.jsx)(r,{client:i,children:(0,f.jsx)(`div`,{className:`mx-auto w-full max-w-3xl p-6`,children:e})})}var f,p,m,h,g,_,v,y,b,x,S,C,w,T;function E(){return(E=e((()=>{f=n(),a(),i(),p=t(),c(),l(),m={plan:`pro`,weeklyLimit:70,used:20,remaining:50,resetAt:`2026-08-24T18:00:00.000Z`,isExhausted:!1,warningThreshold:14,isNearLimit:!1},h={title:`Features/Dashboard/Organisms/SettingsUsageStatsSection`,component:u,parameters:{layout:`fullscreen`}},g={render:()=>(0,f.jsx)(d,{usage:m,children:(0,f.jsx)(u,{})})},_={render:()=>(0,f.jsx)(d,{usage:{...m,used:58,remaining:12,isNearLimit:!0},children:(0,f.jsx)(u,{})})},v={...g,parameters:{themes:{themeOverride:`light`}}},y={render:()=>(0,f.jsx)(d,{usage:{...m,used:70,remaining:0,isExhausted:!0},children:(0,f.jsx)(u,{})})},b={render:()=>(0,f.jsx)(d,{usage:{...m,_stale:!0},children:(0,f.jsx)(u,{})})},x={render:()=>(0,f.jsx)(d,{usage:m,mode:`error`,children:(0,f.jsx)(u,{})})},S={...x,parameters:{themes:{themeOverride:`light`}}},C={render:()=>(0,f.jsx)(d,{usage:m,mode:`loading`,children:(0,f.jsx)(u,{})})},w={render:()=>(0,f.jsx)(d,{usage:m,mode:`failed-retry`,children:(0,f.jsx)(u,{})})},T=[`Healthy`,`NearLimit`,`HealthyLight`,`Exhausted`,`Stale`,`RecoverableError`,`RecoverableErrorLight`,`Loading`,`FailedRetry`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <UsageStoryProvider usage={baseUsage}>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <UsageStoryProvider usage={{
    ...baseUsage,
    used: 58,
    remaining: 12,
    isNearLimit: true
  }}>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  ...Healthy,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  render: () => <UsageStoryProvider usage={{
    ...baseUsage,
    used: 70,
    remaining: 0,
    isExhausted: true
  }}>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: () => <UsageStoryProvider usage={{
    ...baseUsage,
    _stale: true
  }}>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  render: () => <UsageStoryProvider usage={baseUsage} mode='error'>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  ...RecoverableError,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  render: () => <UsageStoryProvider usage={baseUsage} mode='loading'>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: () => <UsageStoryProvider usage={baseUsage} mode='failed-retry'>
      <SettingsUsageStatsSection />
    </UsageStoryProvider>
}`,...w.parameters?.docs?.source}}}})))()}E();export{y as Exhausted,w as FailedRetry,g as Healthy,v as HealthyLight,C as Loading,_ as NearLimit,x as RecoverableError,S as RecoverableErrorLight,b as Stale,T as __namedExportsOrder,h as default};
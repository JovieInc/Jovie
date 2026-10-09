import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{H as n,U as r}from"./removable-_8fTgXVw.js";import{c as i,s as a}from"./iframe-B1b4EUuv.js";import{n as o,t as s}from"./keys-CNuKOgyu.js";import{n as c,t as l}from"./SettingsAdPixelsSection-XaSr6-3u.js";function u({settings:e,health:t,children:r}){let i=new a({defaultOptions:{queries:{retry:!1,refetchOnWindowFocus:!1,staleTime:1/0}}});return e&&i.setQueryData(o.pixels.settings(),e),t&&i.setQueryData(o.pixels.health(),t),(0,d.jsx)(n,{client:i,children:(0,d.jsx)(`div`,{className:`w-2xl max-w-full`,children:r})})}var d,f,p,m,h,g,_,v,y,b,x;function S(){return(S=e((()=>{d=t(),i(),r(),s(),c(),f={pixels:{facebookPixelId:`1234567890123456`,googleMeasurementId:`G-ABCDE12345`,tiktokPixelId:null,enabled:!0,facebookEnabled:!0,googleEnabled:!0,tiktokEnabled:!1},hasTokens:{facebook:!0,google:!0,tiktok:!1}},p={platforms:{facebook:{status:`healthy`,totalSent:482,totalFailed:3,lastSuccessAt:`2026-09-27T00:00:00.000Z`},google:{status:`healthy`,totalSent:310,totalFailed:0,lastSuccessAt:`2026-09-27T00:00:00.000Z`},tiktok:{status:`inactive`,totalSent:0,totalFailed:0,lastSuccessAt:null}},aggregate:{totalEventsThisWeek:792,overallSuccessRate:99.6}},m={platforms:{facebook:{status:`inactive`,totalSent:0,totalFailed:0,lastSuccessAt:null},google:{status:`inactive`,totalSent:0,totalFailed:0,lastSuccessAt:null},tiktok:{status:`inactive`,totalSent:0,totalFailed:0,lastSuccessAt:null}},aggregate:{totalEventsThisWeek:0,overallSuccessRate:0}},h={title:`Dashboard/Organisms/SettingsAdPixelsSection`,component:l,parameters:{layout:`padded`,jovie:{uncoveredProps:[`platform`,`platformKey`,`description`,`pixelIdLabel`,`pixelIdPlaceholder`,`pixelIdName`,`pixelIdValue`,`tokenLabel`,`tokenPlaceholder`,`tokenName`,`tokenValue`,`helpUrl`,`helpText`,`onPixelIdChange`,`onTokenChange`,`isConfigured`]}},args:{isPro:!0}},g={decorators:[e=>(0,d.jsx)(u,{settings:f,health:p,children:(0,d.jsx)(e,{})})]},_={decorators:[e=>(0,d.jsx)(u,{settings:{pixels:{facebookPixelId:null,googleMeasurementId:null,tiktokPixelId:null,enabled:!0,facebookEnabled:!1,googleEnabled:!1,tiktokEnabled:!1},hasTokens:{facebook:!1,google:!1,tiktok:!1}},health:m,children:(0,d.jsx)(e,{})})]},v={args:{isPro:!1},decorators:[e=>(0,d.jsx)(u,{settings:null,health:null,children:(0,d.jsx)(e,{})})]},y={..._,parameters:{themes:{themeOverride:`light`}}},b={...g,parameters:{themes:{themeOverride:`light`}}},x=[`Configured`,`Empty`,`FreePlanGated`,`EmptyLight`,`ConfiguredLight`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <PixelsStoryShell settings={configuredSettings} health={healthyStatus}>
        <Story />
      </PixelsStoryShell>]
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <PixelsStoryShell settings={{
    pixels: {
      facebookPixelId: null,
      googleMeasurementId: null,
      tiktokPixelId: null,
      enabled: true,
      facebookEnabled: false,
      googleEnabled: false,
      tiktokEnabled: false
    },
    hasTokens: {
      facebook: false,
      google: false,
      tiktok: false
    }
  }} health={inactiveStatus}>
        <Story />
      </PixelsStoryShell>]
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    isPro: false
  },
  decorators: [Story => <PixelsStoryShell settings={null} health={null}>
        <Story />
      </PixelsStoryShell>]
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  ...Empty,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  ...Configured,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...b.parameters?.docs?.source}}}})))()}S();export{g as Configured,b as ConfiguredLight,_ as Empty,y as EmptyLight,v as FreePlanGated,x as __namedExportsOrder,h as default};
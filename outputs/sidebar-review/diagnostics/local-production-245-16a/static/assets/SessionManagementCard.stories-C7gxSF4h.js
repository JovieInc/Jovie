import{n as e,s as t}from"./rolldown-runtime-BcKkbAw3.js";import{t as n}from"./react-CFeKwT_a.js";import{t as r}from"./jsx-runtime-BbDfbRii.js";import"./iframe-B1b4EUuv.js";import{n as i,t as a}from"./SettingsPanel-C5KHHcGC.js";import{n as o,t as s}from"./SessionManagementCard-54s0Z78y.js";function c(e,t){let n=0;return({url:r})=>{if(r.pathname.endsWith(`/list-sessions`))return e===`pending`?new Promise(()=>void 0):e===`reauth`?Promise.resolve(new Response(JSON.stringify({code:`SESSION_NOT_FRESH`,message:`Session is not fresh`}),{status:403,headers:{"Content-Type":`application/json`}})):e===`error`||e===`recover`&&n++===0?Promise.resolve(new Response(`Internal error`,{status:500})):Promise.resolve(new Response(JSON.stringify(e===`empty`?[]:t),{status:200,headers:{"Content-Type":`application/json`}}));if(r.pathname.endsWith(`/revoke-session`)||r.pathname.endsWith(`/revoke-other-sessions`))return Promise.resolve(new Response(JSON.stringify({status:!0}),{status:200}))}}function l({children:e,mode:t,sessions:n=[]}){return d.useLayoutEffect(()=>{let e=window,r=e.__jovieApiMock;return e.__jovieApiMock=c(t,n),()=>{e.__jovieApiMock=r}},[t,n]),(0,u.jsx)(u.Fragment,{children:e})}var u,d,f,p,m,h,g,_,v,y,b,x,S,C;function w(){return(w=e((()=>{u=r(),d=t(n()),i(),o(),f={id:`session-current`,token:`token-current`,userAgent:`Electron`,createdAt:`2026-09-20T00:00:00.000Z`,updatedAt:`2026-09-26T09:00:00.000Z`,expiresAt:`2026-10-26T09:00:00.000Z`},p={id:`session-other`,token:`token-other`,userAgent:`Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1`,createdAt:`2026-09-18T00:00:00.000Z`,updatedAt:`2026-09-25T12:00:00.000Z`,expiresAt:`2026-10-25T12:00:00.000Z`},m={title:`Dashboard/Organisms/AccountSettings/SessionManagementCard`,component:s,parameters:{layout:`padded`},args:{activeSessionId:f.id},decorators:[e=>(0,u.jsx)(`div`,{className:`max-w-2xl`,children:(0,u.jsx)(a,{title:`Active Sessions`,children:(0,u.jsx)(e,{})})})]},h={decorators:[e=>(0,u.jsx)(l,{mode:`sessions`,sessions:[f],children:(0,u.jsx)(e,{})})]},g={decorators:[e=>(0,u.jsx)(l,{mode:`sessions`,sessions:[f,p],children:(0,u.jsx)(e,{})})]},_={decorators:[e=>(0,u.jsx)(l,{mode:`pending`,children:(0,u.jsx)(e,{})})]},v={decorators:[e=>(0,u.jsx)(l,{mode:`empty`,children:(0,u.jsx)(e,{})})]},y={decorators:[e=>(0,u.jsx)(l,{mode:`error`,children:(0,u.jsx)(e,{})})]},b={decorators:[e=>(0,u.jsx)(l,{mode:`recover`,sessions:[f],children:(0,u.jsx)(e,{})})]},x={decorators:[e=>(0,u.jsx)(l,{mode:`reauth`,children:(0,u.jsx)(e,{})})]},S={...y,parameters:{themes:{themeOverride:`light`}}},C=[`CurrentDeviceOnly`,`MultipleSessions`,`Loading`,`Empty`,`ErrorState`,`RecoverAfterRetry`,`SignInRequired`,`ErrorLight`],h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithSessionsFetch mode='sessions' sessions={[CURRENT_SESSION]}>
        <Story />
      </WithSessionsFetch>]
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithSessionsFetch mode='sessions' sessions={[CURRENT_SESSION, OTHER_SESSION]}>
        <Story />
      </WithSessionsFetch>]
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithSessionsFetch mode='pending'>
        <Story />
      </WithSessionsFetch>]
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithSessionsFetch mode='empty'>
        <Story />
      </WithSessionsFetch>]
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithSessionsFetch mode='error'>
        <Story />
      </WithSessionsFetch>]
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithSessionsFetch mode='recover' sessions={[CURRENT_SESSION]}>
        <Story />
      </WithSessionsFetch>]
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <WithSessionsFetch mode='reauth'>
        <Story />
      </WithSessionsFetch>]
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  ...ErrorState,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...S.parameters?.docs?.source}}}})))()}w();export{h as CurrentDeviceOnly,v as Empty,S as ErrorLight,y as ErrorState,_ as Loading,g as MultipleSessions,b as RecoverAfterRetry,x as SignInRequired,C as __namedExportsOrder,m as default};
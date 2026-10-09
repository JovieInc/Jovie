import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{n,r}from"./navigation-lA0z5ElE.js";import{t as i}from"./jsx-runtime-BbDfbRii.js";import{H as a,U as o}from"./removable-_8fTgXVw.js";import{a as s,l as c}from"./navigation-state-Dd8clVGa.js";import{c as l,i as u,r as d,s as f}from"./DashboardNav-BDxpkM3d.js";import{r as ee,t as p}from"./button-BSHhPV4e.js";import{c as te,h as ne,p as re,s as m}from"./iframe-B1b4EUuv.js";import{n as ie,r as ae}from"./DashboardDataContext-C9tVUD5-.js";import{s as oe,t as h}from"./routes-NOD5Mahi.js";import{n as se,r as ce,t as le}from"./HeaderActionsContext-jlsme0ww.js";import{a as ue,i as de,n as fe,r as g,t as _}from"./UnifiedSidebar-D-cyGG9o.js";import{n as pe,r as me}from"./useJovieAuth-BIVJUTCS.js";import{n as he,t as ge}from"./AskJovie-Bt7fGFi_.js";import{n as _e,r as ve}from"./SidebarContext-BRIJo3yt.js";import{n as ye,t as be}from"./SidebarCollapseButton-BbUnM_ZW.js";import{n as xe,t as Se}from"./context-CDpFhzjN.js";import{a as v,r as y}from"./session-work-state-TNC_SPt2.js";import{n as b,t as x}from"./keys-CNuKOgyu.js";import{r as S,t as C}from"./contracts-Pk-CzMuN.js";import{n as w,t as T}from"./client-DQQ7krb1.js";import{a as E,t as D}from"./useTrackAudioPlayer-DNE0yCEn.js";import{n as O,t as k}from"./RuntimeUpdateProvider-tkJec13O.js";import{n as A,t as j}from"./DashboardHeader-98hmbfnT.js";import{n as Ce,t as we}from"./AppShellFrame-CzA8Me4D.js";import{n as Te,t as Ee}from"./PersistentAudioBar-Dgywxs-X.js";import{n as De,r as Oe,t as ke}from"./CommandPalette-DdYR070N.js";import{n as M,r as Ae}from"./signed-in-session-D_LAMto1.js";import"./system-b-app-0raEe-jZ.js";import{n as je,r as Me}from"./rendered-family-DM7S6Kg-.js";import{n as Ne,t as Pe}from"./ChatInput-DlCeeZXi.js";function Fe({children:e}){return(0,P.jsx)(Se,{children:e})}function N({section:e,variant:t,media:r=!1,inspector:i=!1}){let{open:a,isMobile:o}=ve(),{isCommandPaletteOpen:s,commandPaletteHeader:c,commandPalettePages:l}=ce();(0,F.useEffect)(()=>{let e=window;e.sidebarFixturePages=l?.map(({id:e,label:t,href:n})=>({id:e,label:t,href:n})),e.sidebarFixtureNavigation=()=>n().push.mock.calls},[l]);let[u,d]=(0,F.useState)(`A saved release draft`);v({hasDraft:r&&u.length>0,isStreaming:!1,isUploading:!1,hasPendingAction:!1,isAuthenticating:!1});let f=E();return(0,P.jsx)(we,{brandVariant:t,sidebar:(0,P.jsx)(_,{section:e,variant:t,headerOwnsCollapsedToggle:!0}),header:(0,P.jsx)(j,{commandPaletteHeader:c,sidebarTriggerOnMobile:!0,breadcrumbs:[{label:`Home`}],sidebarTrigger:!a||o?(0,P.jsxs)(`div`,{className:o?`flex items-center gap-1.5`:`-ml-3 flex items-center gap-1.5`,children:[(0,P.jsx)(ge,{variant:t,railOwner:`left`}),(0,P.jsx)(be,{})]}):void 0}),main:(0,P.jsxs)(P.Fragment,{children:[(0,P.jsx)(ke,{}),s?(0,P.jsx)(F.Profiler,{id:`sidebar-page-search`,onRender:(e,t,n)=>{let r=window;(r.sidebarPaletteRenderSamples??=[]).push({phase:t,duration:n})},children:(0,P.jsx)(De,{})}):(0,P.jsxs)(`div`,{"data-testid":`sidebar-experience-content`,className:r?`flex h-full min-h-0 flex-col`:`h-full overflow-y-auto`,children:[(0,P.jsxs)(`div`,{className:r?`min-h-0 flex-1 overflow-y-auto px-3 py-4 text-sm text-secondary-token`:`h-64 px-3 py-4 text-sm text-secondary-token`,children:[`Your workspace`,r?(0,P.jsx)(p,{variant:`ghost`,size:`sm`,type:`button`,onClick:()=>{let e=new Uint8Array(8044),t=new DataView(e.buffer),n=(t,n)=>[...n].forEach((n,r)=>{e[t+r]=n.charCodeAt(0)});n(0,`RIFF`),t.setUint32(4,e.length-8,!0),n(8,`WAVE`),n(12,`fmt `),t.setUint32(16,16,!0),t.setUint16(20,1,!0),t.setUint16(22,1,!0),t.setUint32(24,16e3,!0),t.setUint32(28,32e3,!0),t.setUint16(32,2,!0),t.setUint16(34,16,!0),n(36,`data`),t.setUint32(40,8e3,!0),f.toggleTrack({id:`sidebar-sample`,title:`Sidebar sample`,artistName:`Test fixture`,audioUrl:`data:audio/wav;base64,${btoa(String.fromCharCode(...e))}`})},children:`Load sample track`}):null]}),r?(0,P.jsx)(`div`,{className:`shrink-0 px-3 pb-3`,children:(0,P.jsx)(Pe,{value:u,onChange:d,onSubmit:()=>void 0,isLoading:!1,dictationEnabled:!1,variant:`default`})}):(0,P.jsx)(`div`,{className:`h-96 px-3 text-sm text-secondary-token`,children:`Activity`})]})]}),rightPanel:i?(0,P.jsx)(`div`,{className:`h-full w-64 bg-surface-1 p-3`,"data-testid":`sidebar-inspector-fixture`,children:(0,P.jsx)(p,{variant:`ghost`,size:`sm`,type:`button`,children:`Inspector action`})}):void 0,audioPlayer:r?(0,P.jsx)(Ee,{}):void 0})}function Ie(e){let[t]=(0,F.useState)(()=>{let e=new m({defaultOptions:{queries:{retry:!1}}});return e.setQueryData(b.chat.conversations(),Array.from({length:50},(e,t)=>({id:`long-${t}`,title:`A long conversation title about release preparation, touring and audience follow-up ${t}`,updatedAt:new Date(Date.now()-t*36e5).toISOString(),latestTurnStatus:t===0?`streaming`:t===1?`failed_timeout`:`completed`,latestMessageRole:`assistant`}))),e});return(0,P.jsx)(a,{client:t,children:(0,P.jsx)(N,{...e})})}function Le(e){let t=u(Y),n=(0,F.useMemo)(()=>({key:`sidebar-more-scale`,backHref:h.DASHBOARD,backLabel:`Home`,content:(0,P.jsx)(F.Profiler,{id:`sidebar-large-more`,onRender:(e,t,n)=>{let r=window;(r.sidebarScaleRenderSamples??=[]).push({phase:t,duration:n})},children:(0,P.jsx)(f,{items:Y,isActive:X,onFindPage:t})})}),[t]);return ue(n),(0,P.jsx)(N,{...e})}var P,F,I,L,R,z,B,V,H,U,W,G,K,q,J,Y,X,Z,Q;function $(){return($=e((()=>{P=i(),Me(),ee(),ne(),r(),te(),o(),F=t(),M(),ae(),he(),A(),Ne(),ye(),xe(),_e(),O(),l(),d(),oe(),se(),de(),c(),me(),y(),w(),S(),x(),Ce(),Oe(),Te(),D(),fe(),I=new m({defaultOptions:{queries:{retry:!1}}}),I.setQueryData(b.chat.conversations(),[{id:`merch`,title:`Merch drop checklist`,updatedAt:new Date(Date.now()-12e4).toISOString(),latestTurnStatus:`completed`},{id:`tour`,title:`Tour announce — caption drafts`,updatedAt:new Date(Date.now()-36e5).toISOString(),latestTurnStatus:`completed`},{id:`fans`,title:`Fan segment Q3 planning`,updatedAt:new Date(Date.now()-864e5).toISOString(),latestTurnStatus:`completed`}]),L={user:{id:`story-user`},creatorProfiles:[{id:`story-profile`,avatarUrl:null,displayName:`Tim White`,username:`timwhite`,usernameNormalized:`timwhite`}],selectedProfile:{id:`story-profile`,avatarUrl:null,displayName:`Tim White`,username:`timwhite`,usernameNormalized:`timwhite`},needsOnboarding:!1,sidebarCollapsed:!1,hasSocialLinks:!1,hasMusicLinks:!1,isAdmin:!1,tippingStats:{tipClicks:0,qrTipClicks:0,linkTipClicks:0,tipsSubmitted:0,totalReceivedCents:0,monthReceivedCents:0},profileCompletion:{percentage:0,completedCount:0,totalCount:0,steps:[],profileIsLive:!1},inboxNavigation:{state:`empty`,pendingCount:0}},R={title:`Organisms/UnifiedSidebar`,component:_,parameters:{layout:`fullscreen`},decorators:[Ae,(e,t)=>(0,P.jsx)(a,{client:I,children:(0,P.jsx)(T,{initialFlags:{...C,PROFILES_WORKSPACE:!0},children:(0,P.jsx)(ie,{value:L,children:(0,P.jsx)(re,{children:(0,P.jsx)(Fe,{children:(0,P.jsx)(pe,{children:(0,P.jsx)(le,{children:(0,P.jsx)(k,{children:(0,P.jsx)(g,{children:t.parameters.sharedShell?(0,P.jsx)(e,{}):(0,P.jsx)(je,{name:`unified-sidebar`,owner:`UnifiedSidebar`,children:(0,P.jsx)(`div`,{className:`h-screen w-(--app-shell-sidebar-width)`,children:(0,P.jsx)(e,{})})})})})})})})})})})})],args:{section:`dashboard`,variant:`jovie`}},z={},B={parameters:{sharedShell:!0,nextjs:{navigation:{pathname:h.DASHBOARD}}},render:e=>(0,P.jsx)(N,{...e})},V={render:e=>(0,P.jsx)(N,{...e}),parameters:{sharedShell:!0,nextjs:{navigation:{pathname:h.ADMIN_CHAT}}},args:{section:`ov`,variant:`ov`}},H={parameters:{sharedShell:!0,nextjs:{navigation:{pathname:h.DASHBOARD}}},render:e=>(0,P.jsx)(N,{...e,media:!0})},U={args:{section:`admin`},parameters:{nextjs:{navigation:{pathname:h.LEGACY_ADMIN}}}},W={parameters:{nextjs:{navigation:{pathname:h.DEMO}}}},G={args:{section:`settings`}},K={parameters:{nextjs:{navigation:{pathname:h.ADMIN_CHAT}}},args:{section:`ov`,variant:`ov`}},q={parameters:{sharedShell:!0,nextjs:{navigation:{pathname:h.DASHBOARD}}},render:e=>(0,P.jsx)(Ie,{...e})},J={parameters:{sharedShell:!0,nextjs:{navigation:{pathname:h.DASHBOARD}}},render:e=>(0,P.jsx)(N,{...e,media:!0,inspector:!0})},Y=Array.from({length:120},(e,t)=>({...s,id:`scale-page-${t}`,name:`Calendar page fixture ${t+1}: a long authorized destination label`})),X=()=>!1,Z={parameters:{sharedShell:!0,nextjs:{navigation:{pathname:h.DASHBOARD}}},render:e=>(0,P.jsx)(Le,{...e})},Q=[`Dashboard`,`SharedShell`,`OperatorSharedShell`,`SharedMediaShell`,`LegacyAdmin`,`Demo`,`Settings`,`Operator`,`LongRecentShell`,`InspectorMediaShell`,`LargeMoreShell`],z.parameters={...z.parameters,docs:{...z.parameters?.docs,source:{originalSource:`{}`,...z.parameters?.docs?.source}}},B.parameters={...B.parameters,docs:{...B.parameters?.docs,source:{originalSource:`{
  parameters: {
    sharedShell: true,
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.DASHBOARD
      }
    }
  },
  render: args => <SidebarExperienceFrame {...args} />
}`,...B.parameters?.docs?.source}}},V.parameters={...V.parameters,docs:{...V.parameters?.docs,source:{originalSource:`{
  render: args => <SidebarExperienceFrame {...args} />,
  parameters: {
    sharedShell: true,
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.ADMIN_CHAT
      }
    }
  },
  args: {
    section: 'ov',
    variant: 'ov'
  }
}`,...V.parameters?.docs?.source}}},H.parameters={...H.parameters,docs:{...H.parameters?.docs,source:{originalSource:`{
  parameters: {
    sharedShell: true,
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.DASHBOARD
      }
    }
  },
  render: args => <SidebarExperienceFrame {...args} media />
}`,...H.parameters?.docs?.source}}},U.parameters={...U.parameters,docs:{...U.parameters?.docs,source:{originalSource:`{
  args: {
    section: 'admin'
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.LEGACY_ADMIN
      }
    }
  }
}`,...U.parameters?.docs?.source}}},W.parameters={...W.parameters,docs:{...W.parameters?.docs,source:{originalSource:`{
  parameters: {
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.DEMO
      }
    }
  }
}`,...W.parameters?.docs?.source}}},G.parameters={...G.parameters,docs:{...G.parameters?.docs,source:{originalSource:`{
  args: {
    section: 'settings'
  }
}`,...G.parameters?.docs?.source}}},K.parameters={...K.parameters,docs:{...K.parameters?.docs,source:{originalSource:`{
  parameters: {
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.ADMIN_CHAT
      }
    }
  },
  args: {
    section: 'ov',
    variant: 'ov'
  }
}`,...K.parameters?.docs?.source}}},q.parameters={...q.parameters,docs:{...q.parameters?.docs,source:{originalSource:`{
  parameters: {
    sharedShell: true,
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.DASHBOARD
      }
    }
  },
  render: args => <LongRecentFixture {...args} />
}`,...q.parameters?.docs?.source}}},J.parameters={...J.parameters,docs:{...J.parameters?.docs,source:{originalSource:`{
  parameters: {
    sharedShell: true,
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.DASHBOARD
      }
    }
  },
  render: args => <SidebarExperienceFrame {...args} media inspector />
}`,...J.parameters?.docs?.source}}},Z.parameters={...Z.parameters,docs:{...Z.parameters?.docs,source:{originalSource:`{
  parameters: {
    sharedShell: true,
    nextjs: {
      navigation: {
        pathname: APP_ROUTES.DASHBOARD
      }
    }
  },
  render: args => <LargeMoreFixture {...args} />
}`,...Z.parameters?.docs?.source}}}})))()}$();export{z as Dashboard,W as Demo,J as InspectorMediaShell,Z as LargeMoreShell,U as LegacyAdmin,q as LongRecentShell,K as Operator,V as OperatorSharedShell,G as Settings,H as SharedMediaShell,B as SharedShell,Q as __namedExportsOrder,R as default};
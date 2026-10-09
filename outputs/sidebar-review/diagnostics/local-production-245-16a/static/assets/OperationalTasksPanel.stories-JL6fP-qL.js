import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,r as i}from"./OperationalTasksPanel-CrR-qpSf.js";import"./iframe-B1b4EUuv.js";import{n as a,r as o,t as s}from"./RightPanelContext-YZbrsGtE.js";import{n as c,t as l}from"./AppShellRightRail-LDNKfzAM.js";import"./system-b-app-0raEe-jZ.js";function u(e={}){return{canonicalSource:`linear`,cacheMode:`local-reconciled`,syncState:`fresh`,sourceId:`lane-pull-requests`,observedAt:`2026-09-01T22:00:00.000Z`,lastSyncedAt:`2026-09-01T22:00:00.000Z`,freshnessDeadline:`2026-09-01T22:00:10.000Z`,tasks:[{id:`linear:JOV-5544`,linearIdentifier:`JOV-5544`,linearUrl:`https://linear.app/jovie/issue/JOV-5544/cache-symphony`,title:`Cache Symphony workspaces on NVMe`,workflowState:`running`,priority:`high`,attempt:2,retryAt:null,sourceRevision:`rev-2`,updatedAt:`2026-09-01T22:00:00.000Z`}],deltas:[],...e}}function d(){let e=o();return(0,p.jsx)(l,{children:e})}function f(e){let[t,n]=(0,m.useState)(null);return(0,p.jsxs)(`div`,{className:`flex h-svh min-w-0 bg-(--app-shell-content-surface)`,children:[(0,p.jsx)(`div`,{className:`min-w-0 flex-1 overflow-y-auto p-4`,children:(0,p.jsx)(r,{...e,selectedTaskId:t,onSelectTask:n})}),e.presentation===`page`?(0,p.jsx)(d,{}):null]})}var p,m,h,g,_,v,y,b,x,S;function C(){return(C=e((()=>{p=n(),m=t(),c(),a(),i(),h={title:`Features/Admin/Hud/OperationalTasksPanel`,component:r,parameters:{layout:`fullscreen`},render:e=>(0,p.jsx)(s,{children:(0,p.jsx)(f,{...e})})},g={args:{feed:u(),requestState:`idle`}},_={args:{feed:u(),requestState:`error`}},v={args:{feed:u({syncState:`failed`,lastSyncedAt:null,observedAt:null,freshnessDeadline:null,tasks:[],deltas:[]}),requestState:`error`}},y={args:{feed:u({tasks:[],deltas:[],lastSyncedAt:null}),requestState:`idle`}},b={args:{feed:u({tasks:Array.from({length:20},(e,t)=>({...u().tasks[0],id:`task-${t}`,linearIdentifier:`JOV-${5544+t}`}))}),presentation:`page`}},x={...b,parameters:{themes:{themeOverride:`light`}}},S=[`FreshTasks`,`StaleAfterError`,`SyncFailedEmpty`,`EmptyIdle`,`Standalone`,`StandaloneLight`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    feed: feed(),
    requestState: 'idle'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    feed: feed(),
    requestState: 'error'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    feed: feed({
      syncState: 'failed',
      lastSyncedAt: null,
      observedAt: null,
      freshnessDeadline: null,
      tasks: [],
      deltas: []
    }),
    requestState: 'error'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    feed: feed({
      tasks: [],
      deltas: [],
      lastSyncedAt: null
    }),
    requestState: 'idle'
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    feed: feed({
      tasks: Array.from({
        length: 20
      }, (_, i) => ({
        ...feed().tasks[0],
        id: \`task-\${i}\`,
        linearIdentifier: \`JOV-\${5544 + i}\`
      }))
    }),
    presentation: 'page'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  ...Standalone,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...x.parameters?.docs?.source}}}})))()}C();export{y as EmptyIdle,g as FreshTasks,_ as StaleAfterError,b as Standalone,x as StandaloneLight,v as SyncFailedEmpty,S as __namedExportsOrder,h as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./badge-DqMNX1OQ.js";import{i as a,r as o}from"./layout-DXKnPoEh.js";import{n as s,t as c}from"./TableEmptyState-CkWDPdS3.js";import{g as l,s as u}from"./PageToolbar-CxNLpn7f.js";import{n as d,t as f}from"./tanstack-table-C03_ny4z.js";import{n as p,t as m}from"./AdminDataTable-CNXDNSn1.js";import{n as h,r as g}from"./AdminTableHeader-_h8r4pGb.js";function _({getValue:e}){return(0,C.jsx)(`span`,{className:`font-medium text-primary-token whitespace-nowrap`,children:e()})}function v({getValue:e,row:t}){let n=t.original;return(0,C.jsxs)(`div`,{children:[(0,C.jsx)(`span`,{className:`block truncate text-secondary-token`,children:e()}),(0,C.jsx)(`span`,{className:`mt-0.5 block text-xs text-tertiary-token md:hidden`,children:n.timestamp})]})}function y({getValue:e}){return(0,C.jsx)(`span`,{className:`whitespace-nowrap text-secondary-token`,children:e()})}function b(e){return(0,C.jsx)(i,{variant:T[e],size:`sm`,children:E[e]})}function x({items:e}){let t=(0,w.useMemo)(()=>O,[]);return(0,C.jsxs)(`div`,{className:j,"data-testid":`admin-activity-content`,children:[A,(0,C.jsx)(`div`,{className:`overflow-x-auto`,children:(0,C.jsx)(m,{data:e,columns:t,isLoading:!1,emptyState:(0,C.jsx)(c,{heading:`No Recent Activity`,description:`Activity from the last 7 days will appear here.`,testId:`admin-activity-empty-state`}),getRowId:e=>e.id})})]})}function S({rows:e=8}={}){let t=(0,w.useMemo)(()=>O,[]);return(0,C.jsxs)(`div`,{className:j,"aria-busy":`true`,children:[A,(0,C.jsx)(`div`,{className:`overflow-x-auto`,children:(0,C.jsx)(m,{data:[],columns:t,isLoading:!0,skeletonRows:e,skeletonColumnConfig:k,rowHeight:o.STANDARD})})]})}var C,w,T,E,D,O,k,A,j;function M(){return(M=e((()=>{C=n(),r(),w=t(),l(),s(),p(),g(),a(),d(),T={success:`success`,warning:`warning`,error:`error`},E={success:`Success`,warning:`Needs review`,error:`Error`},D=f(),O=[D.accessor(`user`,{id:`user`,header:`Actor`,cell:_,size:200}),D.accessor(`action`,{id:`action`,header:`Action`,cell:v}),D.accessor(`timestamp`,{id:`timestamp`,header:`Time`,cell:y,size:180,minSize:150}),D.accessor(`status`,{id:`status`,header:`Status`,cell:({getValue:e})=>b(e()),size:140})],k=[{width:`120px`,variant:`text`},{width:`240px`,variant:`text`},{width:`110px`,variant:`text`},{width:`64px`,variant:`badge`}],A=(0,C.jsx)(h,{start:(0,C.jsx)(`p`,{className:u,children:`50 most recent admin and system events`})}),j=`h-full border-0 bg-(--app-shell-content-surface)`})))()}var N,P,F,I,L,R,z;function B(){return(B=e((()=>{N=n(),M(),P={title:`Admin/Activity/ActivityTableUnified`,component:x,parameters:{layout:`fullscreen`},decorators:[e=>(0,N.jsx)(`div`,{className:`min-h-96 p-4`,children:(0,N.jsx)(e,{})})],args:{items:[]}},F={},I={args:{items:[{id:`activity-1`,user:`@operator`,action:`Approved a generated playlist`,timestamp:`2 minutes ago`,status:`success`},{id:`activity-2`,user:`System`,action:`Publisher connection needs review`,timestamp:`18 minutes ago`,status:`warning`}]}},L={...I,parameters:{viewport:{defaultViewport:`mobile1`}}},R={render:()=>(0,N.jsx)(S,{rows:5})},z=[`Empty`,`Populated`,`Narrow`,`Loading`],F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{}`,...F.parameters?.docs?.source}}},I.parameters={...I.parameters,docs:{...I.parameters?.docs,source:{originalSource:`{
  args: {
    items: [{
      id: 'activity-1',
      user: '@operator',
      action: 'Approved a generated playlist',
      timestamp: '2 minutes ago',
      status: 'success'
    }, {
      id: 'activity-2',
      user: 'System',
      action: 'Publisher connection needs review',
      timestamp: '18 minutes ago',
      status: 'warning'
    }]
  }
}`,...I.parameters?.docs?.source}}},L.parameters={...L.parameters,docs:{...L.parameters?.docs,source:{originalSource:`{
  ...Populated,
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...L.parameters?.docs?.source}}},R.parameters={...R.parameters,docs:{...R.parameters?.docs,source:{originalSource:`{
  render: () => <ActivityTableSkeleton rows={5} />
}`,...R.parameters?.docs?.source}}}})))()}B();export{F as Empty,R as Loading,L as Narrow,I as Populated,z as __namedExportsOrder,P as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./createLucideIcon-DKtuYzxz.js";import{n as i,t as a}from"./cable-_a9JRVjL.js";import{n as o,t as s}from"./wrench-C1GGvSJ2.js";import{n as c,t as l}from"./EmptyState-yNZ1izLX.js";import{r as u,t as d}from"./ContentSurfaceCard-NsoaLSLh.js";import{i as f,n as p,r as m,t as h}from"./AdminSystemMapSkillsTab-BNN0naCO.js";import{n as g,r as _}from"./registry-DEA2KLR7.js";var v,y;function b(){return(b=e((()=>{n(),v={name:`database`,size:24,node:[[`ellipse`,{cx:`12`,cy:`5`,rx:`9`,ry:`3`,key:`msslwz`}],[`path`,{d:`M3 5V19A9 3 0 0 0 21 19V5`,key:`1wlel7`}],[`path`,{d:`M3 12A9 3 0 0 0 21 12`,key:`mv7ke4`}]]},v.node,y=r(v)})))()}function x({activeTab:e}){if(e===`skills`)return(0,S.jsx)(h,{});if(e===`connectors`){let e=g();return(0,S.jsx)(`div`,{"data-testid":`system-map-connectors`,className:`space-y-3`,children:e.map(e=>(0,S.jsxs)(d,{surface:`nested`,className:`flex items-start gap-3 p-4`,children:[(0,S.jsx)(a,{className:`mt-0.5 h-4 w-4 shrink-0 text-secondary-token`}),(0,S.jsxs)(`div`,{className:`min-w-0`,children:[(0,S.jsx)(`p`,{className:`text-sm font-medium text-primary-token`,children:e.label}),(0,S.jsx)(`p`,{className:`mt-0.5 text-xs text-secondary-token`,children:e.description})]})]},e.id))})}if(e===`tools`){let e=Object.values(m).filter(e=>e.kind===`tool`);return(0,S.jsx)(`div`,{"data-testid":`system-map-tools`,className:`space-y-3`,children:e.length===0?(0,S.jsx)(l,{heading:`No tools registered.`,testId:`system-map-tools-empty`}):e.map(e=>(0,S.jsxs)(d,{surface:`nested`,className:`flex items-start gap-3 p-4`,children:[(0,S.jsx)(s,{className:`mt-0.5 h-4 w-4 shrink-0 text-secondary-token`}),(0,S.jsxs)(`div`,{className:`min-w-0`,children:[(0,S.jsx)(`p`,{className:`text-sm font-medium text-primary-token`,children:e.name}),(0,S.jsx)(`p`,{className:`mt-0.5 text-xs text-secondary-token`,children:e.description}),(0,S.jsx)(`p`,{className:`mt-1 font-mono text-2xs text-tertiary-token`,children:e.model})]})]},e.id))})}return(0,S.jsxs)(`div`,{"data-testid":`system-map-memory`,className:`space-y-3`,children:[(0,S.jsx)(`p`,{className:`text-xs text-secondary-token`,children:`Entity types tracked in the memory graph (memory.ts — JOV-10370).`}),(0,S.jsx)(`div`,{className:`flex flex-wrap gap-2`,children:[`person`,`artist`,`song`,`location`,`studio`,`company`,`event`,`project`,`asset`,`file`,`release`,`recording`].map(e=>(0,S.jsxs)(`span`,{className:`inline-flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1 text-xs text-primary-token`,children:[(0,S.jsx)(y,{className:`h-3 w-3 text-secondary-token`,"aria-hidden":`true`}),e]},e))})]})}var S;function C(){return(C=e((()=>{S=t(),i(),b(),o(),u(),c(),f(),_(),p()})))()}var w,T,E,D,O,k,A;function j(){return(j=e((()=>{w=t(),C(),T={title:`Features/Admin/System Map/AdminSystemMap`,component:x,parameters:{layout:`fullscreen`},decorators:[e=>(0,w.jsx)(`div`,{className:`min-h-screen bg-surface-page p-4 sm:p-6`,children:(0,w.jsx)(e,{})})]},E={args:{activeTab:`connectors`}},D={args:{activeTab:`tools`}},O={args:{activeTab:`memory`}},k={args:{activeTab:`memory`},parameters:{viewport:{defaultViewport:`mobile1`}}},A=[`Connectors`,`Tools`,`Memory`,`MobileMemory`],E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    activeTab: 'connectors'
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    activeTab: 'tools'
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    activeTab: 'memory'
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    activeTab: 'memory'
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...k.parameters?.docs?.source}}}})))()}j();export{E as Connectors,O as Memory,k as MobileMemory,D as Tools,A as __namedExportsOrder,T as default};
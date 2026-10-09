import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{i,r as a,t as o}from"./AudiencePanelContext-BExAbIbJ.js";function s(){let{mode:e,toggle:t,close:n}=i();return(0,c.jsxs)(`div`,{className:`flex items-center gap-2`,children:[[`contact`,`analytics`,`ai-crawlers`].map(n=>(0,c.jsx)(r,{size:`sm`,variant:`outline`,onClick:()=>t(n),"aria-pressed":e===n,children:n},n)),(0,c.jsx)(r,{size:`sm`,variant:`link`,onClick:n,children:`Close`}),(0,c.jsxs)(`span`,{className:`text-app text-tertiary-token`,children:[`active: `,e??`none`]})]})}var c,l,u,d,f;function p(){return(p=e((()=>{c=t(),n(),a(),l={title:`Dashboard/Organisms/AudiencePanelContext`,parameters:{layout:`centered`}},u={render:()=>(0,c.jsx)(o,{children:(0,c.jsx)(s,{})})},d={render:()=>(0,c.jsx)(o,{initialMode:`analytics`,children:(0,c.jsx)(s,{})})},f=[`Closed`,`OpenToAnalytics`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <AudiencePanelProvider>
      <AudiencePanelDemo />
    </AudiencePanelProvider>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <AudiencePanelProvider initialMode='analytics'>
      <AudiencePanelDemo />
    </AudiencePanelProvider>
}`,...d.parameters?.docs?.source}}}})))()}p();export{u as Closed,d as OpenToAnalytics,f as __namedExportsOrder,l as default};
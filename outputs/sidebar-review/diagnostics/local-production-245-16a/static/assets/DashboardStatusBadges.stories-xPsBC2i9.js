import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./AudienceIntentBadge-DTrRkKxB.js";import{n as i,t as a}from"./ConfidenceBadge-CGkhk9P1.js";import{n as o,t as s}from"./MatchStatusBadge-BMMHyltE.js";function c(){return(0,l.jsxs)(`div`,{className:`flex flex-col gap-6`,children:[(0,l.jsxs)(`section`,{className:`flex flex-col gap-2`,children:[(0,l.jsx)(`p`,{className:`text-2xs text-tertiary-token`,children:`Confidence`}),(0,l.jsxs)(`div`,{className:`flex flex-wrap items-center gap-2`,children:[(0,l.jsx)(a,{score:.92}),(0,l.jsx)(a,{score:.64}),(0,l.jsx)(a,{score:.31}),(0,l.jsx)(a,{score:.92,showLabel:!0})]})]}),(0,l.jsxs)(`section`,{className:`flex flex-col gap-2`,children:[(0,l.jsx)(`p`,{className:`text-2xs text-tertiary-token`,children:`Match status`}),(0,l.jsxs)(`div`,{className:`flex flex-wrap items-center gap-2`,children:[(0,l.jsx)(s,{status:`suggested`}),(0,l.jsx)(s,{status:`confirmed`}),(0,l.jsx)(s,{status:`auto_confirmed`}),(0,l.jsx)(s,{status:`rejected`})]})]}),(0,l.jsxs)(`section`,{className:`flex flex-col gap-2`,children:[(0,l.jsx)(`p`,{className:`text-2xs text-tertiary-token`,children:`Audience intent`}),(0,l.jsxs)(`div`,{className:`flex flex-wrap items-center gap-2`,children:[(0,l.jsx)(r,{intentLevel:`high`}),(0,l.jsx)(r,{intentLevel:`medium`}),(0,l.jsx)(r,{intentLevel:`low`})]})]})]})}var l,u,d,f,p,m,h;function g(){return(g=e((()=>{l=t(),n(),i(),o(),u={title:`Dashboard/Atoms/StatusBadges`,parameters:{layout:`centered`}},d={render:()=>(0,l.jsx)(c,{})},f={render:()=>(0,l.jsxs)(`div`,{className:`flex max-w-xs flex-wrap items-center gap-2`,children:[(0,l.jsx)(s,{status:`auto_confirmed`}),(0,l.jsx)(a,{score:.88,showLabel:!0}),(0,l.jsx)(r,{intentLevel:`medium`})]})},p={render:()=>(0,l.jsx)(c,{}),parameters:{backgrounds:{default:`light`},themes:{themeOverride:`light`}}},m={render:()=>(0,l.jsx)(c,{}),parameters:{backgrounds:{default:`dark`},themes:{themeOverride:`dark`}}},h=[`SemanticRoles`,`LongLabels`,`Light`,`Dark`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <StatusBadgeMatrix />
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex max-w-xs flex-wrap items-center gap-2'>
      <MatchStatusBadge status='auto_confirmed' />
      <ConfidenceBadge score={0.88} showLabel />
      <AudienceIntentBadge intentLevel='medium' />
    </div>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <StatusBadgeMatrix />,
  parameters: {
    backgrounds: {
      default: 'light'
    },
    themes: {
      themeOverride: 'light'
    }
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <StatusBadgeMatrix />,
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    themes: {
      themeOverride: 'dark'
    }
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{m as Dark,p as Light,f as LongLabels,d as SemanticRoles,h as __namedExportsOrder,u as default};
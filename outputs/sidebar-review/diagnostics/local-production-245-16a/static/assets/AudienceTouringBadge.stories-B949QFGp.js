import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./map-pin-D-OWoYxT.js";import{i,t as a}from"./utils-AN1vFgqV.js";function o({touringCity:e,showDate:t,className:n}){if(!e)return null;let i=t?new Date(t).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`}):null,o=`Upcoming show in ${e}${i?` on ${i}`:``}`;return(0,s.jsxs)(`div`,{className:a(`inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-px text-3xs font-caption text-amber-600 dark:text-amber-400 max-w-25`,n),title:o,children:[(0,s.jsx)(r,{className:`h-2.5 w-2.5 shrink-0`,"aria-hidden":`true`}),(0,s.jsx)(`span`,{className:`truncate`,children:e})]})}var s;function c(){return(c=e((()=>{s=t(),n(),i()})))()}var l,u,d,f,p;function m(){return(m=e((()=>{c(),l={title:`Organisms/Table/Atoms/AudienceTouringBadge`,component:o,parameters:{layout:`centered`},args:{touringCity:`Austin, TX`,showDate:`2026-11-14`}},u={},d={args:{showDate:null}},f={args:{touringCity:null,showDate:null}},p=[`Default`,`WithoutDate`,`NoUpcomingShow`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    showDate: null
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    touringCity: null,
    showDate: null
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{u as Default,f as NoUpcomingShow,d as WithoutDate,p as __namedExportsOrder,l as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./circle-alert-B-EGAHI2.js";import{n as i,t as a}from"./circle-check-CjH05h9T.js";import{n as o,t as s}from"./circle-dashed-BAAIUxwM.js";import{i as c,t as l}from"./utils-AN1vFgqV.js";function u(e,t,n,r){return e===`anonymous`&&!t&&!n&&!r?`anonymous`:t||e===`customer`||e===`spotify`?`identified`:`partial`}function d({type:e,hasEmail:t,hasPhone:n,spotifyConnected:r,className:i}){let a=u(e,t,n,r),o=p[a],s=m[a];return(0,f.jsxs)(`div`,{className:l(`flex items-center gap-1.5 text-app`,i),children:[(0,f.jsx)(s,{className:l(`h-3.5 w-3.5 shrink-0`,o.iconClassName),"aria-hidden":`true`}),(0,f.jsx)(`span`,{className:o.labelClassName,children:o.label})]})}var f,p,m;function h(){return(h=e((()=>{f=t(),n(),i(),o(),c(),p={identified:{label:`Identified`,iconClassName:`text-emerald-500`,labelClassName:`text-emerald-600 dark:text-emerald-400`},partial:{label:`Partial`,iconClassName:`text-amber-400`,labelClassName:`text-amber-600 dark:text-amber-400`},anonymous:{label:`Anonymous`,iconClassName:`text-tertiary-token`,labelClassName:`text-tertiary-token`}},m={identified:a,partial:r,anonymous:s}})))()}var g,_,v,y,b;function x(){return(x=e((()=>{h(),g={title:`Organisms/Table/AudienceIdentificationIndicator`,component:d,parameters:{layout:`centered`},args:{type:`customer`,hasEmail:!0,hasPhone:!1,spotifyConnected:!1}},_={},v={args:{type:`sms`,hasEmail:!1,hasPhone:!0,spotifyConnected:!1}},y={args:{type:`anonymous`,hasEmail:!1,hasPhone:!1,spotifyConnected:!1}},b=[`Identified`,`Partial`,`Anonymous`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'sms',
    hasEmail: false,
    hasPhone: true,
    spotifyConnected: false
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    type: 'anonymous',
    hasEmail: false,
    hasPhone: false,
    spotifyConnected: false
  }
}`,...y.parameters?.docs?.source}}}})))()}x();export{y as Anonymous,_ as Identified,v as Partial,b as __namedExportsOrder,g as default};
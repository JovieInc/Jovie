import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./flame-Cr0o-rdh.js";import{n as i,t as a}from"./minus-CLKPKvrq.js";import{n as o,t as s}from"./trending-up-CNZp4vPt.js";import{n as c,t as l}from"./simple-tooltip-DjmLZRou.js";import{i as u,t as d}from"./utils-AN1vFgqV.js";import{h as f,p}from"./iframe-B1b4EUuv.js";function m({visits:e,intentLevel:t,className:n}){let{icon:r,color:i,label:a}=g[t];return(0,h.jsx)(l,{content:`${e} ${e===1?`visit`:`visits`} · ${a}`,side:`top`,children:(0,h.jsxs)(`div`,{className:d(`flex items-center gap-1.5 text-app text-secondary-token`,n),children:[(0,h.jsx)(`span`,{className:`tabular-nums font-book`,children:e}),(0,h.jsx)(r,{className:d(`h-4 w-4 shrink-0`,i),"aria-hidden":`true`})]})})}var h,g;function _(){return(_=e((()=>{h=t(),c(),n(),i(),o(),u(),g={high:{icon:r,color:`text-emerald-500`,label:`High Intent`},medium:{icon:s,color:`text-amber-400`,label:`Medium Intent`},low:{icon:a,color:`text-tertiary-token`,label:`Low Intent`}}})))()}var v,y,b,x,S,C;function w(){return(w=e((()=>{v=t(),f(),_(),y={title:`Organisms/Table/AudienceEngagementCell`,component:m,parameters:{layout:`centered`},args:{visits:12,intentLevel:`high`},decorators:[e=>(0,v.jsx)(p,{children:(0,v.jsx)(e,{})})]},b={},x={args:{visits:5,intentLevel:`medium`}},S={args:{visits:1,intentLevel:`low`}},C=[`HighIntent`,`MediumIntent`,`LowIntent`],b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    visits: 5,
    intentLevel: 'medium'
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    visits: 1,
    intentLevel: 'low'
  }
}`,...S.parameters?.docs?.source}}}})))()}w();export{b as HighIntent,S as LowIntent,x as MediumIntent,C as __namedExportsOrder,y as default};
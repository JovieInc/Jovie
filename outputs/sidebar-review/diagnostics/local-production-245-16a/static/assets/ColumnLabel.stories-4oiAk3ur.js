import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./arrow-down-BZ3k7_e2.js";import{n as i,t as a}from"./arrow-up-down-7-7Ee-aD.js";import{n as o,t as s}from"./arrow-up-XomoXdJh.js";import{i as c,t as l}from"./utils-AN1vFgqV.js";import{n as u,t as d}from"./shell-caption-Ctqxwh-C.js";function f({field:e,label:t,width:n,flex:i,align:o,sortBy:c,sortDir:u,onSort:f,defaultField:m,className:h}){let g=c===e&&e!==m;return(0,p.jsxs)(`button`,{type:`button`,onClick:()=>f(e),className:l(d,`group/col h-6 px-1 -mx-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page) transition-colors duration-subtle ease-subtle`,i?`flex-1 min-w-0`:n??``,`shrink-0 inline-flex items-center gap-1`,o===`right`&&`flex-row-reverse`,g?`text-cyan-300/90`:`text-quaternary-token/85 hover:text-secondary-token`,h),children:[(0,p.jsx)(`span`,{children:t}),(0,p.jsx)(`span`,{"aria-hidden":`true`,className:l(`inline-flex items-center transition-opacity duration-subtle ease-subtle`,g?`opacity-100`:`opacity-0 group-hover/col:opacity-60`),children:g?u===`asc`?(0,p.jsx)(s,{className:`h-2.5 w-2.5`,strokeWidth:2.5}):(0,p.jsx)(r,{className:`h-2.5 w-2.5`,strokeWidth:2.5}):(0,p.jsx)(a,{className:`h-2.5 w-2.5`,strokeWidth:2.25})})]})}var p;function m(){return(m=e((()=>{p=t(),n(),o(),i(),c(),u()})))()}var h,g,_,v,y,b,x,S;function C(){return(C=e((()=>{h=t(),m(),{fn:g}=__STORYBOOK_MODULE_TEST__,_={title:`Shell/ColumnLabel`,component:f,parameters:{layout:`centered`},decorators:[e=>(0,h.jsx)(`div`,{className:`bg-base p-4`,children:(0,h.jsx)(e,{})})],args:{field:`title`,label:`Title`,align:`left`,sortBy:`title`,sortDir:`asc`,onSort:g()}},v={},y={args:{sortDir:`desc`}},b={args:{sortBy:`artist`}},x={args:{field:`releaseDate`,label:`Release date`,align:`right`,sortBy:`releaseDate`}},S=[`ActiveAscending`,`ActiveDescending`,`Inactive`,`RightAligned`],v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    sortDir: 'desc'
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    sortBy: 'artist'
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    field: 'releaseDate',
    label: 'Release date',
    align: 'right',
    sortBy: 'releaseDate'
  }
}`,...x.parameters?.docs?.source}}}})))()}C();export{v as ActiveAscending,y as ActiveDescending,b as Inactive,x as RightAligned,S as __namedExportsOrder,_ as default};
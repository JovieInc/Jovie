import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./archive-CVwcZmQc.js";import{n as i,t as a}from"./trash-DM9Ayg-e.js";import{n as o,t as s}from"./x-4tQOC7Cc.js";import{r as c,t as l}from"./button-BSHhPV4e.js";import{n as u,t as d}from"./icon-button-ChwKjABM.js";import{d as f,f as p,n as m,r as h,t as g}from"./dropdown-menu-Y42T2GdN.js";import{i as _,t as v}from"./utils-AN1vFgqV.js";function y({selectedCount:e,bulkActions:t,onClearSelection:n,className:r}){return e===0?null:(0,b.jsxs)(`div`,{className:v(`flex h-7 items-center gap-2`,r),children:[(0,b.jsxs)(`span`,{className:`whitespace-nowrap text-2xs font-caption tabular-nums text-secondary-token`,children:[e,` selected`]}),t.length>0&&(0,b.jsxs)(g,{children:[(0,b.jsx)(f,{asChild:!0,children:(0,b.jsx)(l,{variant:`secondary`,size:`sm`,children:`Actions`})}),(0,b.jsx)(m,{align:`start`,children:t.map(e=>(0,b.jsxs)(h,{onClick:e.onClick,disabled:e.disabled,variant:e.variant,children:[e.icon,e.label]},e.label))})]}),n?(0,b.jsx)(d,{variant:`secondary`,size:`sm`,onClick:n,ariaLabel:`Clear Selection`,children:(0,b.jsx)(s,{"aria-hidden":`true`})}):null]})}var b;function x(){return(x=e((()=>{b=t(),c(),p(),u(),o(),_()})))()}var S,C,w,T,E;function D(){return(D=e((()=>{S=t(),n(),i(),x(),C={title:`Organisms/Table/HeaderBulkActions`,component:y,parameters:{layout:`centered`}},w={args:{selectedCount:3,bulkActions:[{label:`Archive`,icon:(0,S.jsx)(r,{}),onClick:()=>void 0},{label:`Export`,onClick:()=>void 0,disabled:!0},{label:`Delete`,icon:(0,S.jsx)(a,{}),onClick:()=>void 0,variant:`destructive`}],onClearSelection:()=>void 0}},T={args:{selectedCount:2,bulkActions:[],onClearSelection:()=>void 0}},E=[`Selected`,`ClearOnly`],w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    selectedCount: 3,
    bulkActions: [{
      label: 'Archive',
      icon: <Archive />,
      onClick: () => undefined
    }, {
      label: 'Export',
      onClick: () => undefined,
      disabled: true
    }, {
      label: 'Delete',
      icon: <Trash2 />,
      onClick: () => undefined,
      variant: 'destructive'
    }],
    onClearSelection: () => undefined
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    selectedCount: 2,
    bulkActions: [],
    onClearSelection: () => undefined
  }
}`,...T.parameters?.docs?.source}}}})))()}D();export{T as ClearOnly,w as Selected,E as __namedExportsOrder,C as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{i as r,n as i,r as a,t as o}from"./ViewModeSlider-BDiKpT62.js";import{n as s,t as c}from"./layout-list-BLwNjkab.js";import{n as l,t as u}from"./table-2-Ci-vHoyr.js";function d(){let[e,t]=(0,p.useState)(`grid`);return(0,f.jsxs)(`div`,{className:`grid gap-3`,children:[(0,f.jsx)(o,{"aria-label":`Library View`,value:e,onChange:t,options:m}),(0,f.jsxs)(`p`,{className:`text-xs text-tertiary-token`,children:[`Active view: `,(0,f.jsx)(`span`,{className:`text-primary-token`,children:e})]})]})}var f,p,m,h,g,_,v;function y(){return(y=e((()=>{f=n(),r(),s(),l(),p=t(),i(),m=[{value:`grid`,label:`Grid View`,icon:a},{value:`list`,label:`List View`,icon:c},{value:`table`,label:`Table View`,icon:u}],h={title:`Organisms/Table/ViewModeSlider`,component:o,parameters:{layout:`centered`},tags:[`autodocs`]},g={args:{"aria-label":`Library View`,value:`grid`,onChange:()=>void 0,options:m},render:()=>(0,f.jsx)(d,{})},_={name:`List active`,args:{...g.args,value:`list`},render:e=>(0,f.jsx)(o,{"aria-label":e[`aria-label`],value:`list`,onChange:()=>void 0,options:m})},v=[`Default`,`ListActive`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    'aria-label': 'Library View',
    value: 'grid',
    onChange: () => undefined,
    options: VIEW_OPTIONS
  },
  render: () => <LibraryViewDemo />
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  name: 'List active',
  args: {
    ...Default.args,
    value: 'list'
  },
  render: args => <ViewModeSlider aria-label={args['aria-label']} value='list' onChange={() => undefined} options={VIEW_OPTIONS} />
}`,..._.parameters?.docs?.source}}}})))()}y();export{g as Default,_ as ListActive,v as __namedExportsOrder,h as default};
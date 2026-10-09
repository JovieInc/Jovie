import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./AdminDataTable-CNXDNSn1.js";var r,i,a,o,s,c;function l(){return(l=e((()=>{t(),r=[{accessorKey:`name`,header:`Name`},{accessorKey:`status`,header:`Status`}],i=[{id:`1`,name:`Midnight Signal`,status:`Active`},{id:`2`,name:`Neon Rivers`,status:`Pending`}],a={title:`Admin/Tables/AdminDataTable`,component:n,parameters:{layout:`fullscreen`}},o={args:{columns:r,data:i,getRowId:e=>e.id}},s={args:{columns:r,data:[],isLoading:!0,skeletonRows:5}},c=[`Default`,`Loading`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    columns,
    data,
    getRowId: row => row.id
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    columns,
    data: [],
    isLoading: true,
    skeletonRows: 5
  }
}`,...s.parameters?.docs?.source}}}})))()}l();export{o as Default,s as Loading,c as __namedExportsOrder,a as default};
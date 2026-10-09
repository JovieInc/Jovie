import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./button-BSHhPV4e.js";import{n as a,t as o}from"./UnifiedTable-obLkFdcR.js";import"./system-b-app-0raEe-jZ.js";function s(){let[e,t]=(0,u.useState)(!0);return(0,l.jsxs)(`div`,{className:`space-y-3`,children:[(0,l.jsx)(i,{onClick:()=>t(e=>!e),children:e?`Hide artist column`:`Show artist column`}),(0,l.jsx)(o,{data:f,columns:d,columnVisibility:{artist:e},enableVirtualization:!1})]})}function c(){let[e,t]=(0,u.useState)(!0);return(0,l.jsxs)(`div`,{className:`space-y-3`,children:[(0,l.jsx)(i,{onClick:()=>t(e=>!e),children:e?`Show rows`:`Show loading`}),(0,l.jsx)(o,{data:Array.from({length:200},(e,t)=>({id:`row-${t}`,title:`Release ${t+1}`,artist:`Fixture artist`})),columns:d,rowMode:`two-line`,isLoading:e,skeletonRows:7,enableVirtualization:!0,containerClassName:`h-96`,getRowId:e=>e.id})]})}var l,u,d,f,p,m,h,g,_,v;function y(){return(y=e((()=>{l=n(),r(),u=t(),a(),d=[{accessorKey:`title`,header:`Title`},{accessorKey:`artist`,header:`Artist`}],f=[{id:`one`,title:`Never Say A Word`,artist:`Tim White`},{id:`two`,title:`Seaside Heights`,artist:`Tim White`}],p={title:`Organisms/Table/UnifiedTable`,component:o,parameters:{layout:`padded`,jovie:{uncoveredProps:[`loading`]}}},m={args:{data:f,columns:d,enableVirtualization:!1,getRowId:e=>e.id,contextMenuSearchable:!0,contextMenuSearchPlaceholder:`Search actions`,contextMenuSearchMode:`recursive`,getContextMenuItems:e=>[{id:`copy-title`,label:`Copy ${e.title}`,onClick:()=>void 0}]}},h={args:{data:f,columns:d,isLoading:!0,skeletonRows:2}},g={render:()=>(0,l.jsx)(s,{})},_={render:()=>(0,l.jsx)(c,{})},v=[`SearchableContextActions`,`Loading`,`ResponsiveColumns`,`RowModeLoadingAndScroll`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    data,
    columns,
    enableVirtualization: false,
    getRowId: row => row.id,
    contextMenuSearchable: true,
    contextMenuSearchPlaceholder: 'Search actions',
    contextMenuSearchMode: 'recursive',
    getContextMenuItems: row => [{
      id: 'copy-title',
      label: \`Copy \${row.title}\`,
      onClick: () => undefined
    }]
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    data,
    columns,
    isLoading: true,
    skeletonRows: 2
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => <ResponsiveColumnsExample />
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: () => <RowModeScrollFixture />
}`,..._.parameters?.docs?.source}}}})))()}y();export{h as Loading,g as ResponsiveColumns,_ as RowModeLoadingAndScroll,m as SearchableContextActions,v as __namedExportsOrder,p as default};
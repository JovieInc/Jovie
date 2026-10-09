import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,n as r,r as i,t as a}from"./AudienceTableContext-DDoSsRD4.js";function o(){let e=n();return(0,s.jsxs)(`div`,{className:`text-app text-secondary-token`,children:[(0,s.jsxs)(`p`,{children:[`selected: `,e.selectedIds.size]}),(0,s.jsxs)(`p`,{children:[`open menu row: `,e.openMenuRowId??`none`]}),(0,s.jsxs)(`p`,{children:[`hidden columns:`,` `,Object.entries(e.hiddenMetadataColumns).filter(([,e])=>e).map(([e])=>e).join(`, `)||`none`]})]})}var s,c,l,u;function d(){return(d=e((()=>{s=t(),i(),c={title:`Dashboard/Organisms/DashboardAudienceTable/AudienceTableContext`,parameters:{layout:`centered`}},l={render:()=>(0,s.jsx)(a,{value:{toggleSelect:()=>{},setOpenMenuRowId:()=>{},getContextMenuItems:()=>[],onExportMember:()=>{},onBlockMember:()=>{},onViewProfile:()=>{},onSendNotification:()=>{},getTouringCity:()=>null,hiddenMetadataColumns:{location:!1,source:!1,engagement:!1,lastSeen:!1}},children:(0,s.jsx)(r,{value:{selectedIds:new Set([`member-1`]),openMenuRowId:null},children:(0,s.jsx)(o,{})})})},u=[`Default`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <AudienceTableStableProvider value={{
    toggleSelect: () => {},
    setOpenMenuRowId: () => {},
    getContextMenuItems: () => [],
    onExportMember: () => {},
    onBlockMember: () => {},
    onViewProfile: () => {},
    onSendNotification: () => {},
    getTouringCity: () => null,
    hiddenMetadataColumns: {
      location: false,
      source: false,
      engagement: false,
      lastSeen: false
    }
  }}>
      <AudienceTableVolatileProvider value={{
      selectedIds: new Set(['member-1']),
      openMenuRowId: null
    }}>
        <AudienceTableContextDemo />
      </AudienceTableVolatileProvider>
    </AudienceTableStableProvider>
}`,...l.parameters?.docs?.source}}}})))()}d();export{l as Default,u as __namedExportsOrder,c as default};
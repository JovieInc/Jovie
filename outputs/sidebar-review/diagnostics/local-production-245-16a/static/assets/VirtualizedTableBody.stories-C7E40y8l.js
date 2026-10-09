import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,t as r}from"./useLegacyTable-D0InwJu7.js";import{n as i,t as a}from"./tanstack-table-C03_ny4z.js";import{n as o,t as s}from"./VirtualizedTableBody-DnzveomD.js";function c(e){let t=n({data:u,columns:d,getRowId:e=>e.id,getCoreRowModel:r()}).getRowModel().rows;return(0,l.jsx)(s,{...e,rows:t})}var l,u,d,f,p,m;function h(){return(h=e((()=>{l=t(),i(),o(),u=[{id:`one`,title:`Never Say A Word`},{id:`two`,title:`Seaside Heights`}],d=[a().accessor(`title`,{header:`Title`})],f={title:`Organisms/Table/VirtualizedTableBody`,component:s,parameters:{layout:`padded`}},p={render:e=>(0,l.jsx)(`table`,{className:`w-full text-primary-token`,children:(0,l.jsx)(c,{...e})}),args:{rows:[],shouldVirtualize:!1,rowRefsMap:new Map,shouldEnableKeyboardNav:!1,focusedIndex:-1,onFocusChange:()=>void 0,onKeyDown:()=>void 0,columnCount:1,contextMenuSearchable:!0,contextMenuSearchPlaceholder:`Search actions`,contextMenuSearchMode:`recursive`,getContextMenuItems:e=>[{id:`copy-title`,label:`Copy ${e.title}`,onClick:()=>void 0}]}},m=[`SearchableContextActions`],p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: args => <table className='w-full text-primary-token'>
      <TableBodyWithModel {...args} />
    </table>,
  args: {
    rows: [],
    shouldVirtualize: false,
    rowRefsMap: new Map(),
    shouldEnableKeyboardNav: false,
    focusedIndex: -1,
    onFocusChange: () => undefined,
    onKeyDown: () => undefined,
    columnCount: 1,
    contextMenuSearchable: true,
    contextMenuSearchPlaceholder: 'Search actions',
    contextMenuSearchMode: 'recursive',
    getContextMenuItems: row => [{
      id: 'copy-title',
      label: \`Copy \${row.title}\`,
      onClick: () => undefined
    }]
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{p as SearchableContextActions,m as __namedExportsOrder,f as default};
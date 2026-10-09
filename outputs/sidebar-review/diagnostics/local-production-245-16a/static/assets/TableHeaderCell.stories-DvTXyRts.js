import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./TableHeaderCell-CNmYzm24.js";function i(e){return{id:e,isPlaceholder:!1,getSize:()=>160,column:{columnDef:{header:e,meta:void 0},getCanSort:()=>!0,getIsSorted:()=>!1,getToggleSortingHandler:()=>()=>void 0},getContext:()=>({})}}var a,o,s,c,l;function u(){return(u=e((()=>{a=t(),n(),o={title:`Organisms/Table/TableHeaderCell`,component:r,parameters:{layout:`centered`}},s={render:()=>(0,a.jsx)(`table`,{children:(0,a.jsx)(`thead`,{children:(0,a.jsx)(`tr`,{children:(0,a.jsx)(r,{header:i(`Title`),canSort:!0,sortDirection:`asc`,stickyHeaderClass:`sticky top-0 bg-surface`,tableHeaderClass:`text-sm font-medium text-primary`,onToggleSort:()=>void 0})})})})},c={render:()=>(0,a.jsx)(`table`,{children:(0,a.jsx)(`thead`,{children:(0,a.jsx)(`tr`,{children:(0,a.jsx)(r,{header:i(`Actions`),canSort:!1,sortDirection:!1,stickyHeaderClass:`sticky top-0 bg-surface`,tableHeaderClass:`text-sm font-medium text-primary`})})})})},l=[`Sortable`,`Plain`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <table>
      <thead>
        <tr>
          <TableHeaderCell header={mockHeader('Title')} canSort sortDirection='asc' stickyHeaderClass='sticky top-0 bg-surface' tableHeaderClass='text-sm font-medium text-primary' onToggleSort={() => undefined} />
        </tr>
      </thead>
    </table>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <table>
      <thead>
        <tr>
          <TableHeaderCell header={mockHeader('Actions')} canSort={false} sortDirection={false} stickyHeaderClass='sticky top-0 bg-surface' tableHeaderClass='text-sm font-medium text-primary' />
        </tr>
      </thead>
    </table>
}`,...c.parameters?.docs?.source}}}})))()}u();export{c as Plain,s as Sortable,l as __namedExportsOrder,o as default};
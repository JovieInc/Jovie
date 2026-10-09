import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./utils-CTJK0RKy.js";import{f as i,l as a,r as o,s}from"./table.styles-C1U-LPyh.js";import{n as c,t as l}from"./SortableHeaderButton-NhH-dTl1.js";function u({children:e,width:t,align:n=`left`,className:s,hideOnMobile:c=!1,sortable:u=!1,sortDirection:f,onSort:p,sticky:m=!0,stickyTop:h=0}){let g=u&&p?(0,d.jsx)(l,{label:typeof e==`string`?e:String(e),direction:f===`asc`||f===`desc`?f:void 0,onClick:p,className:i.headerButton[n]}):(0,d.jsx)(`span`,{className:r(`block w-full line-clamp-1`,i.text[n]),children:e});return(0,d.jsx)(`th`,{className:r(a.tableHeaderCell,`whitespace-nowrap`,m?a.stickyHeader:o.header,i.text[n],t,c&&`max-md:hidden md:table-cell`,s),style:m?{top:`${h}px`}:void 0,children:g})}var d;function f(){return(f=e((()=>{d=t(),n(),c(),s()})))()}var p,m,h,g,_;function v(){return(v=e((()=>{p=t(),f(),m={title:`Organisms/Table/Atoms/TableHeaderCell`,component:u,parameters:{layout:`centered`}},h={args:{children:`Title`},render:()=>(0,p.jsx)(`table`,{children:(0,p.jsx)(`thead`,{children:(0,p.jsxs)(`tr`,{children:[(0,p.jsx)(u,{children:`Title`}),(0,p.jsx)(u,{align:`right`,children:`Count`})]})})})},g={args:{children:`Release Date`},render:()=>(0,p.jsx)(`table`,{children:(0,p.jsx)(`thead`,{children:(0,p.jsx)(`tr`,{children:(0,p.jsx)(u,{sortable:!0,sortDirection:`asc`,onSort:()=>void 0,children:`Release Date`})})})})},_=[`Default`,`Sortable`],h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Title'
  },
  render: () => <table>
      <thead>
        <tr>
          <TableHeaderCell>Title</TableHeaderCell>
          <TableHeaderCell align='right'>Count</TableHeaderCell>
        </tr>
      </thead>
    </table>
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Release Date'
  },
  render: () => <table>
      <thead>
        <tr>
          <TableHeaderCell sortable sortDirection='asc' onSort={() => undefined}>
            Release Date
          </TableHeaderCell>
        </tr>
      </thead>
    </table>
}`,...g.parameters?.docs?.source}}}})))()}v();export{h as Default,g as Sortable,_ as __namedExportsOrder,m as default};
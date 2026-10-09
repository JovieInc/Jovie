import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";import{l as i,s as a}from"./table.styles-C1U-LPyh.js";function o({children:e,stickyOffset:t=0,className:n}){return(0,s.jsx)(`tr`,{className:r(i.tableHeaderRow,n),style:t>0?{top:`${t}px`}:void 0,children:e})}var s;function c(){return(c=e((()=>{s=t(),n(),a()})))()}var l,u,d,f,p;function m(){return(m=e((()=>{l=t(),c(),u={title:`Organisms/Table/TableHeaderRow`,component:o,parameters:{layout:`centered`}},d={args:{children:null},render:()=>(0,l.jsx)(`table`,{children:(0,l.jsx)(`thead`,{children:(0,l.jsxs)(o,{children:[(0,l.jsx)(`th`,{scope:`col`,children:`Name`}),(0,l.jsx)(`th`,{scope:`col`,children:`Status`}),(0,l.jsx)(`th`,{scope:`col`,children:`Amount`})]})})})},f={args:{children:null},render:()=>(0,l.jsx)(`table`,{children:(0,l.jsx)(`thead`,{children:(0,l.jsxs)(o,{stickyOffset:40,children:[(0,l.jsx)(`th`,{scope:`col`,children:`Name`}),(0,l.jsx)(`th`,{scope:`col`,children:`Status`}),(0,l.jsx)(`th`,{scope:`col`,children:`Amount`})]})})})},p=[`Default`,`StickyOffset`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <table>
      <thead>
        <TableHeaderRow>
          <th scope='col'>Name</th>
          <th scope='col'>Status</th>
          <th scope='col'>Amount</th>
        </TableHeaderRow>
      </thead>
    </table>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <table>
      <thead>
        <TableHeaderRow stickyOffset={40}>
          <th scope='col'>Name</th>
          <th scope='col'>Status</th>
          <th scope='col'>Amount</th>
        </TableHeaderRow>
      </thead>
    </table>
}`,...f.parameters?.docs?.source}}}})))()}m();export{d as Default,f as StickyOffset,p as __namedExportsOrder,u as default};
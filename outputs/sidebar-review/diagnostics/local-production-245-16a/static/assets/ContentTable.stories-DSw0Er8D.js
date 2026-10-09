import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./spinner-DFr-ocjD.js";import{i,t as a}from"./utils-AN1vFgqV.js";function o({className:e,wrapperClassName:t,children:n,...r}){return(0,c.jsx)(`div`,{className:a(l,t),children:(0,c.jsx)(`table`,{className:a(u,e),...r,children:n})})}function s({colSpan:e,isLoading:t=!1,emptyMessage:n,loadingLabel:i=`Loading rows`}){return(0,c.jsx)(`tr`,{children:(0,c.jsx)(`td`,{colSpan:e,className:`px-0 py-8 text-center align-middle`,children:t?(0,c.jsxs)(`output`,{className:`flex items-center justify-center`,"aria-busy":`true`,"aria-live":`polite`,children:[(0,c.jsx)(r,{size:`sm`,tone:`muted`}),(0,c.jsx)(`span`,{className:`sr-only`,children:i})]}):(0,c.jsx)(`p`,{className:`text-xs leading-[18px] text-secondary-token`,children:n})})})}var c,l,u;function d(){return(d=e((()=>{c=t(),n(),i(),l=`overflow-x-auto px-4 py-4 sm:px-6`,u=`w-full text-xs text-secondary-token`})))()}var f,p,m,h,g;function _(){return(_=e((()=>{f=t(),d(),p={title:`Molecules/ContentTable`,component:o,parameters:{layout:`padded`}},m={render:()=>(0,f.jsx)(o,{"aria-label":`Contacts`,children:(0,f.jsx)(`tbody`,{children:(0,f.jsx)(s,{colSpan:2,isLoading:!0,emptyMessage:`No contacts yet`,loadingLabel:`Loading contacts`})})})},h={render:()=>(0,f.jsx)(o,{"aria-label":`Contacts`,children:(0,f.jsx)(`tbody`,{children:(0,f.jsx)(s,{colSpan:2,emptyMessage:`No contacts yet`})})})},g=[`Loading`,`Empty`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <ContentTable aria-label='Contacts'>
      <tbody>
        <ContentTableStateRow colSpan={2} isLoading emptyMessage='No contacts yet' loadingLabel='Loading contacts' />
      </tbody>
    </ContentTable>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <ContentTable aria-label='Contacts'>
      <tbody>
        <ContentTableStateRow colSpan={2} emptyMessage='No contacts yet' />
      </tbody>
    </ContentTable>
}`,...h.parameters?.docs?.source}}}})))()}_();export{h as Empty,m as Loading,g as __namedExportsOrder,p as default};
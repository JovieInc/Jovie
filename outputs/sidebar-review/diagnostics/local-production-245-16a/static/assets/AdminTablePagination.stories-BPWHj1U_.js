import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./AdminTablePagination-BgEnTGbN.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={title:`Features/Admin/Table/AdminTablePagination`,component:r,parameters:{layout:`fullscreen`},decorators:[e=>(0,i.jsx)(`div`,{className:`bg-(--app-shell-content-surface) p-4`,children:(0,i.jsx)(e,{})})],args:{page:2,totalPages:5,from:21,to:40,total:91,canPrev:!0,canNext:!0,prevHref:`/admin?page=1`,nextHref:`/admin?page=3`,entityLabel:`records`}},s={},c={args:{page:1,from:1,to:20,canPrev:!1,prevHref:`/admin?page=0`,nextHref:`/admin?page=2`}},l={args:{pageSize:20,onPageSizeChange:a(),pageSizeOptions:[10,20,50]}},u={decorators:[e=>(0,i.jsx)(`div`,{className:`w-80 bg-(--app-shell-content-surface) p-3`,children:(0,i.jsx)(e,{})})]},d=[`Default`,`FirstPageDisabled`,`PageSizeSelector`,`MobileCompact`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    page: 1,
    from: 1,
    to: 20,
    canPrev: false,
    prevHref: '/admin?page=0',
    nextHref: '/admin?page=2'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    pageSize: 20,
    onPageSizeChange: fn(),
    pageSizeOptions: [10, 20, 50]
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <div className='w-80 bg-(--app-shell-content-surface) p-3'>
        <Story />
      </div>]
}`,...u.parameters?.docs?.source}}}})))()}f();export{s as Default,c as FirstPageDisabled,u as MobileCompact,l as PageSizeSelector,d as __namedExportsOrder,o as default};
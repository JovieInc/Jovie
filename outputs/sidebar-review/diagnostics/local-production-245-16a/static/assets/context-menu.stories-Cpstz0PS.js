import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,n as r,o as i,r as a,s as o,t as s}from"./context-menu-C2Af1BER.js";var c,l,u,d,f;function p(){return(p=e((()=>{c=t(),o(),l={title:`UI/Atoms/ContextMenu`,parameters:{layout:`centered`},tags:[`autodocs`]},u={render:()=>(0,c.jsxs)(s,{children:[(0,c.jsx)(i,{className:`flex h-24 w-48 items-center justify-center rounded-md border border-subtle bg-surface-1 text-sm`,children:`Right-click here`}),(0,c.jsxs)(r,{children:[(0,c.jsx)(a,{children:`Open`}),(0,c.jsx)(a,{children:`Share`}),(0,c.jsx)(n,{}),(0,c.jsx)(a,{disabled:!0,children:`Delete`})]})]})},d={parameters:{layout:`fullscreen`},render:()=>(0,c.jsx)(`div`,{className:`flex min-h-56 items-end justify-end p-2`,children:(0,c.jsxs)(s,{children:[(0,c.jsx)(i,{className:`flex h-24 w-48 items-center justify-center rounded-md border border-subtle bg-surface-1 text-sm`,children:`Right-click at the edge`}),(0,c.jsxs)(r,{children:[(0,c.jsx)(a,{children:`Open profile`}),(0,c.jsx)(a,{children:`Copy email`}),(0,c.jsx)(n,{}),(0,c.jsx)(a,{disabled:!0,children:`Remove`})]})]})})},f=[`Default`,`EdgeCollision`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <ContextMenu>
      <ContextMenuTrigger className='flex h-24 w-48 items-center justify-center rounded-md border border-subtle bg-surface-1 text-sm'>
        Right-click here
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Open</ContextMenuItem>
        <ContextMenuItem>Share</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  parameters: {
    layout: 'fullscreen'
  },
  render: () => <div className='flex min-h-56 items-end justify-end p-2'>
      <ContextMenu>
        <ContextMenuTrigger className='flex h-24 w-48 items-center justify-center rounded-md border border-subtle bg-surface-1 text-sm'>
          Right-click at the edge
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Open profile</ContextMenuItem>
          <ContextMenuItem>Copy email</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled>Remove</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{u as Default,d as EdgeCollision,f as __namedExportsOrder,l as default};
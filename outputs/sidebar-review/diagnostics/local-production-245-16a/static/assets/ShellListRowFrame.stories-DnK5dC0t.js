import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,n as r,r as i,t as a}from"./ShellListRowFrame-j_Iy71Lh.js";var o,s,c,l,u,d,f;function p(){return(p=e((()=>{o=t(),n(),s={title:`Organisms/Table/Atoms/ShellListRowFrame`,component:i,parameters:{layout:`centered`},decorators:[e=>(0,o.jsx)(`div`,{className:`w-96 bg-surface-0 p-3 text-primary-token`,children:(0,o.jsx)(e,{})})]},c={args:{chrome:`shell`,density:`standard`,interactive:!0,children:(0,o.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center justify-between gap-3 px-3`,children:[(0,o.jsx)(`span`,{className:`truncate text-sm font-medium`,children:`Command result`}),(0,o.jsx)(`span`,{className:`shrink-0 text-2xs text-tertiary-token`,children:`Cmd+1`})]})}},l={args:{chrome:`shell`,density:`standard`,isSelected:!0,interactive:!0,children:(0,o.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center justify-between gap-3 px-3`,children:[(0,o.jsx)(`span`,{className:`truncate text-sm font-medium`,children:`Selected result`}),(0,o.jsx)(`span`,{className:`shrink-0 text-2xs text-tertiary-token`,children:`Cmd+2`})]})}},u={render:()=>(0,o.jsxs)(`div`,{className:`space-y-1`,children:[(0,o.jsx)(i,{chrome:`shell`,density:`compact`,children:(0,o.jsx)(`div`,{className:`px-3 text-2xs`,children:`Compact row`})}),(0,o.jsx)(i,{chrome:`shell`,density:`dense`,children:(0,o.jsx)(`div`,{className:`px-3 text-xs`,children:`Dense row`})}),(0,o.jsx)(i,{chrome:`shell`,density:`spacious`,children:(0,o.jsxs)(`div`,{className:`flex items-center justify-between px-3 text-sm`,children:[(0,o.jsx)(`span`,{children:`Disclosure row`}),(0,o.jsx)(r,{open:!0})]})})]})},d={render:()=>(0,o.jsx)(a,{chrome:`shell`,density:`standard`,isSelected:!0,className:`w-full px-3 text-left text-sm font-medium`,children:`Clickable row`})},f=[`ShellChrome`,`Selected`,`DensityMatrix`,`ButtonRow`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    chrome: 'shell',
    density: 'standard',
    interactive: true,
    children: <div className='flex min-w-0 flex-1 items-center justify-between gap-3 px-3'>
        <span className='truncate text-sm font-medium'>Command result</span>
        <span className='shrink-0 text-2xs text-tertiary-token'>Cmd+1</span>
      </div>
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    chrome: 'shell',
    density: 'standard',
    isSelected: true,
    interactive: true,
    children: <div className='flex min-w-0 flex-1 items-center justify-between gap-3 px-3'>
        <span className='truncate text-sm font-medium'>Selected result</span>
        <span className='shrink-0 text-2xs text-tertiary-token'>Cmd+2</span>
      </div>
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='space-y-1'>
      <ShellListRowFrame chrome='shell' density='compact'>
        <div className='px-3 text-2xs'>Compact row</div>
      </ShellListRowFrame>
      <ShellListRowFrame chrome='shell' density='dense'>
        <div className='px-3 text-xs'>Dense row</div>
      </ShellListRowFrame>
      <ShellListRowFrame chrome='shell' density='spacious'>
        <div className='flex items-center justify-between px-3 text-sm'>
          <span>Disclosure row</span>
          <ShellListRowDisclosureIcon open />
        </div>
      </ShellListRowFrame>
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <ShellListRowButton chrome='shell' density='standard' isSelected className='w-full px-3 text-left text-sm font-medium'>
      Clickable row
    </ShellListRowButton>
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as ButtonRow,u as DensityMatrix,l as Selected,c as ShellChrome,f as __namedExportsOrder,s as default};
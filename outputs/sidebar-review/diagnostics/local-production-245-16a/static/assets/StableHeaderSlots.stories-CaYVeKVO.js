import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,i as r,r as i}from"./StableHeaderSlots-PhbFQyc4.js";var a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{a=t(),n(),o={title:`Atoms/StableHeaderSlots`,parameters:{layout:`centered`,docs:{description:{component:"Layout-stable header slots used by `EntityHeader` / `DrawerHero`. Both\nreserve their box height even when empty so entity headers never jump\n(zero layout shift) as data streams in."}}}},s={name:`StableHeaderTextSlot / with content`,render:()=>(0,a.jsx)(`div`,{className:`w-64 rounded-md border border-subtle bg-surface-0 p-3`,children:(0,a.jsx)(r,{size:`md`,lineCount:1,children:`Taylor Swift`})})},c={name:`StableHeaderTextSlot / two lines`,render:()=>(0,a.jsx)(`div`,{className:`w-64 rounded-md border border-subtle bg-surface-0 p-3`,children:(0,a.jsx)(r,{size:`sm`,lineCount:2,children:`A very long subtitle that wraps onto a second line before truncating`})})},l={name:`StableHeaderTextSlot / reserved (empty)`,render:()=>(0,a.jsx)(`div`,{className:`w-64 rounded-md border border-subtle bg-surface-0 p-3`,children:(0,a.jsx)(r,{size:`md`,lineCount:1,reserve:!0})})},u={name:`StableHeaderChipRail / with content`,render:()=>(0,a.jsx)(`div`,{className:`w-72 rounded-md border border-subtle bg-surface-0 p-3`,children:(0,a.jsxs)(i,{children:[(0,a.jsx)(`span`,{className:`rounded-full bg-surface-1 px-2 py-0.5 text-2xs`,children:`Verified`}),(0,a.jsx)(`span`,{className:`rounded-full bg-surface-1 px-2 py-0.5 text-2xs`,children:`Pro`})]})})},d={name:`StableHeaderChipRail / reserved (empty)`,render:()=>(0,a.jsx)(`div`,{className:`w-72 rounded-md border border-subtle bg-surface-0 p-3`,children:(0,a.jsx)(i,{reserve:!0})})},f=[`TextSlotWithContent`,`TextSlotTwoLines`,`TextSlotReservedEmpty`,`ChipRailWithContent`,`ChipRailReservedEmpty`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  name: 'StableHeaderTextSlot / with content',
  render: () => <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1}>
        Taylor Swift
      </StableHeaderTextSlot>
    </div>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  name: 'StableHeaderTextSlot / two lines',
  render: () => <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='sm' lineCount={2}>
        A very long subtitle that wraps onto a second line before truncating
      </StableHeaderTextSlot>
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  name: 'StableHeaderTextSlot / reserved (empty)',
  render: () => <div className='w-64 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderTextSlot size='md' lineCount={1} reserve />
    </div>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  name: 'StableHeaderChipRail / with content',
  render: () => <div className='w-72 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderChipRail>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Verified
        </span>
        <span className='rounded-full bg-surface-1 px-2 py-0.5 text-2xs'>
          Pro
        </span>
      </StableHeaderChipRail>
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  name: 'StableHeaderChipRail / reserved (empty)',
  render: () => <div className='w-72 rounded-md border border-subtle bg-surface-0 p-3'>
      <StableHeaderChipRail reserve />
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as ChipRailReservedEmpty,u as ChipRailWithContent,l as TextSlotReservedEmpty,c as TextSlotTwoLines,s as TextSlotWithContent,f as __namedExportsOrder,o as default};
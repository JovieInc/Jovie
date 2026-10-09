import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./kbd-CZIwuZaY.js";import{r as i,t as a}from"./button-BSHhPV4e.js";import{d as o,f as s,h as c,m as l}from"./iframe-B1b4EUuv.js";var u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{u=t(),i(),n(),c(),d={title:`UI/Atoms/Kbd`,component:r,parameters:{layout:`centered`},tags:[`autodocs`]},f={args:{children:`⌘K`}},p={args:{children:`Esc`,variant:`tooltip`},parameters:{backgrounds:{default:`dark`}}},m={render:()=>(0,u.jsxs)(`div`,{className:`flex items-center gap-1.5 text-sm text-secondary-token`,children:[(0,u.jsx)(r,{children:`⌘`}),(0,u.jsx)(r,{children:`⇧`}),(0,u.jsx)(r,{children:`P`}),(0,u.jsx)(`span`,{className:`ml-2`,children:`Open command palette`})]})},h={parameters:{layout:`fullscreen`},render:()=>(0,u.jsxs)(`div`,{"data-testid":`kbd-tooltip-composition`,className:`flex min-h-64 w-full flex-col items-center justify-center gap-12 bg-surface-0 p-8`,children:[(0,u.jsxs)(o,{defaultOpen:!0,children:[(0,u.jsx)(l,{asChild:!0,children:(0,u.jsx)(a,{variant:`outline`,size:`sm`,"data-testid":`kbd-tooltip-short-trigger`,children:`Command palette`})}),(0,u.jsxs)(s,{contentVariant:`compact`,side:`bottom`,className:`flex w-56 max-w-full py-2 items-center gap-2`,style:{maxWidth:`calc(100vw - var(--space-4))`},children:[(0,u.jsx)(`span`,{children:`Open palette`}),(0,u.jsx)(r,{variant:`tooltip`,children:`⌘K`})]})]}),(0,u.jsxs)(o,{defaultOpen:!0,children:[(0,u.jsx)(l,{asChild:!0,children:(0,u.jsx)(a,{variant:`outline`,size:`sm`,"data-testid":`kbd-tooltip-long-trigger`,children:`Navigation`})}),(0,u.jsxs)(s,{contentVariant:`rich`,side:`bottom`,className:`flex w-56 max-w-full py-2 flex-wrap items-center gap-2`,style:{maxWidth:`calc(100vw - var(--space-4))`},children:[(0,u.jsx)(`span`,{className:`min-w-0`,children:`Move focus through the command palette`}),(0,u.jsxs)(`span`,{"data-testid":`kbd-tooltip-shortcut`,className:`flex shrink-0 items-center gap-1`,children:[(0,u.jsx)(r,{variant:`tooltip`,children:`Ctrl`}),(0,u.jsx)(r,{variant:`tooltip`,children:`⇧`}),(0,u.jsx)(r,{variant:`tooltip`,children:`P`})]})]})]})]})},g={parameters:{layout:`centered`},render:()=>(0,u.jsxs)(o,{defaultOpen:!0,children:[(0,u.jsx)(l,{asChild:!0,children:(0,u.jsx)(a,{variant:`outline`,size:`sm`,children:`Navigate`})}),(0,u.jsxs)(s,{contentVariant:`rich`,side:`bottom`,className:`flex w-56 max-w-full py-2 items-center gap-2`,style:{maxWidth:`calc(100vw - var(--space-4))`},children:[(0,u.jsx)(`span`,{className:`min-w-0`,children:`Move through the command palette`}),(0,u.jsx)(r,{variant:`tooltip`,"data-testid":`kbd-tooltip-long-key`,className:`min-w-0 break-words`,children:`Ctrl Alt Shift ArrowRight`})]})]})},_=[`Default`,`TooltipVariant`,`ShortcutSequence`,`TooltipComposition`,`TooltipLongKey`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    children: '⌘K'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Esc',
    variant: 'tooltip'
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-1.5 text-sm text-secondary-token'>
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>P</Kbd>
      <span className='ml-2'>Open command palette</span>
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  parameters: {
    layout: 'fullscreen'
  },
  render: () => <div data-testid='kbd-tooltip-composition' className='flex min-h-64 w-full flex-col items-center justify-center gap-12 bg-surface-0 p-8'>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant='outline' size='sm' data-testid='kbd-tooltip-short-trigger'>
            Command palette
          </Button>
        </TooltipTrigger>
        <TooltipContent contentVariant='compact' side='bottom' className='flex w-56 max-w-full py-2 items-center gap-2' style={{
        maxWidth: 'calc(100vw - var(--space-4))'
      }}>
          <span>Open palette</span>
          <Kbd variant='tooltip'>⌘K</Kbd>
        </TooltipContent>
      </Tooltip>

      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant='outline' size='sm' data-testid='kbd-tooltip-long-trigger'>
            Navigation
          </Button>
        </TooltipTrigger>
        <TooltipContent contentVariant='rich' side='bottom' className='flex w-56 max-w-full py-2 flex-wrap items-center gap-2' style={{
        maxWidth: 'calc(100vw - var(--space-4))'
      }}>
          <span className='min-w-0'>
            Move focus through the command palette
          </span>
          <span data-testid='kbd-tooltip-shortcut' className='flex shrink-0 items-center gap-1'>
            <Kbd variant='tooltip'>Ctrl</Kbd>
            <Kbd variant='tooltip'>⇧</Kbd>
            <Kbd variant='tooltip'>P</Kbd>
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
}`,...h.parameters?.docs?.source},description:{story:`Real Tooltip owner composition for visual review. The short and long
examples keep the keycaps inside the same collision-safe portal so spacing,
radius, font loading, and reflow are judged where the atom is used.`,...h.parameters?.docs?.description}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  parameters: {
    layout: 'centered'
  },
  render: () => <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant='outline' size='sm'>
          Navigate
        </Button>
      </TooltipTrigger>
      <TooltipContent contentVariant='rich' side='bottom' className='flex w-56 max-w-full py-2 items-center gap-2' style={{
      maxWidth: 'calc(100vw - var(--space-4))'
    }}>
        <span className='min-w-0'>Move through the command palette</span>
        <Kbd variant='tooltip' data-testid='kbd-tooltip-long-key' className='min-w-0 break-words'>
          Ctrl Alt Shift ArrowRight
        </Kbd>
      </TooltipContent>
    </Tooltip>
}`,...g.parameters?.docs?.source},description:{story:`Rich Tooltip owner composition with a long shortcut label at compact width.`,...g.parameters?.docs?.description}}}})))()}v();export{f as Default,m as ShortcutSequence,h as TooltipComposition,g as TooltipLongKey,p as TooltipVariant,_ as __namedExportsOrder,d as default};
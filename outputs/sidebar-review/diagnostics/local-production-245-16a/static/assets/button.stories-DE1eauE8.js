import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{a as n,i as r,r as i,t as a}from"./button-BSHhPV4e.js";var o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O,k;function A(){return(A=e((()=>{o=t(),i(),s={title:`shadcn/Button`,component:a,parameters:{layout:`centered`,docs:{description:{component:`Canonical Button component with five variants, three sizes, destructive tone, loading states, and Radix Slot composition.`}}},tags:[`autodocs`],argTypes:{variant:{control:{type:`select`},options:[...n],description:`Visual style variant`},size:{control:{type:`select`},options:[...r],description:`Button size`},destructive:{control:{type:`boolean`},description:`Apply destructive tone to the selected variant`},loading:{control:{type:`boolean`},description:`Show loading spinner`},disabled:{control:{type:`boolean`},description:`Disabled state`},asChild:{control:{type:`boolean`},description:`Render as child element (Radix Slot)`}}},c={args:{children:`Primary Button`,variant:`primary`}},l={args:{children:`Secondary Button`,variant:`secondary`}},u={args:{children:`Tertiary Button`,variant:`tertiary`}},d={args:{children:`Ghost Button`,variant:`ghost`}},f={args:{children:`Delete`,variant:`primary`,destructive:!0}},p={args:{children:`Link Button`,variant:`link`}},m={args:{children:`Small Button`,size:`sm`}},h={args:{children:`Medium Button`,size:`md`}},g={args:{children:`Large Button`,size:`lg`}},_={args:{size:`icon`,children:(0,o.jsx)(`svg`,{className:`h-4 w-4`,fill:`none`,stroke:`currentColor`,viewBox:`0 0 24 24`,"aria-hidden":`true`,children:(0,o.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,strokeWidth:2,d:`M12 4v16m8-8H4`})})}},v={args:{children:`Loading...`,loading:!0}},y={args:{children:`Disabled Button`,disabled:!0}},b={args:{children:`Disabled visual spec`,disabled:!0,variant:`primary`},parameters:{docs:{description:{story:`Disabled-visual spec: data-state="disabled", --state-disabled-opacity, and --color-text-disabled-token.`}}}},x={args:{children:`Loading Disabled`,loading:!0,disabled:!0}},S={args:{children:`Focus visible`,variant:`primary`,size:`lg`,autoFocus:!0},parameters:{docs:{description:{story:`Keyboard focus-visible spec: canonical ring-2 focus ring with page-colored offset on the primary/lg master selection.`}}}},C={render:()=>(0,o.jsx)(`div`,{className:`grid gap-4 p-6`,children:n.filter(e=>e!==`link`).map(e=>(0,o.jsxs)(`div`,{className:`flex flex-wrap items-center gap-3`,children:[(0,o.jsx)(`span`,{className:`w-20 text-xs text-tertiary-token`,children:e}),(0,o.jsx)(a,{variant:e,children:`Idle`}),(0,o.jsx)(a,{variant:e,loading:!0,children:`Loading`}),(0,o.jsx)(a,{variant:e,disabled:!0,children:`Disabled`}),(0,o.jsx)(a,{variant:e,destructive:!0,children:`Destructive`})]},e))}),parameters:{layout:`padded`}},w={render:()=>(0,o.jsxs)(`div`,{className:`flex flex-col gap-4 p-8`,children:[(0,o.jsxs)(`div`,{children:[(0,o.jsx)(`h3`,{className:`text-sm font-semibold mb-2`,children:`/download — label override (icon composed in source)`}),(0,o.jsxs)(a,{variant:`primary`,size:`lg`,className:`gap-2 px-6`,children:[(0,o.jsx)(`svg`,{className:`size-4`,fill:`none`,stroke:`currentColor`,viewBox:`0 0 24 24`,"aria-hidden":`true`,children:(0,o.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,strokeWidth:2,d:`M12 3v12m0 0 4-4m-4 4-4-4M4 21h16`})}),`Download for Mac`]})]}),(0,o.jsxs)(`div`,{children:[(0,o.jsx)(`h3`,{className:`text-sm font-semibold mb-2`,children:`Footer / final CTA — label override`}),(0,o.jsx)(a,{variant:`primary`,size:`lg`,children:`Get started`})]})]}),parameters:{layout:`fullscreen`,docs:{description:{story:`Exact production-backed primary/lg selections that resolve to the same Pen master (button/primary/lg/idle) with independent label overrides. The /download leading icon is source-composed child content: live Pen readback shows the master exposes no leading-icon slot, so icon overrides fail closed.`}}}},T={args:{children:(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(`svg`,{className:`h-4 w-4 mr-2`,fill:`none`,stroke:`currentColor`,viewBox:`0 0 24 24`,"aria-hidden":`true`,children:(0,o.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,strokeWidth:2,d:`M12 4v16m8-8H4`})}),`Add Item`]})}},E={args:{children:`Full Width Button`,className:`w-full`},parameters:{layout:`padded`}},D={args:{children:`Button in Dark Mode`,variant:`primary`},parameters:{backgrounds:{default:`dark`}}},O={render:()=>(0,o.jsxs)(`div`,{className:`flex flex-col gap-4 p-8`,children:[(0,o.jsxs)(`div`,{children:[(0,o.jsx)(`h3`,{className:`text-sm font-semibold mb-2`,children:`Core Variants`}),(0,o.jsxs)(`div`,{className:`flex gap-2 flex-wrap`,children:[(0,o.jsx)(a,{variant:`primary`,children:`Primary`}),(0,o.jsx)(a,{variant:`secondary`,children:`Secondary`}),(0,o.jsx)(a,{variant:`tertiary`,children:`Tertiary`}),(0,o.jsx)(a,{variant:`ghost`,children:`Ghost`}),(0,o.jsx)(a,{variant:`link`,children:`Link`})]})]}),(0,o.jsxs)(`div`,{children:[(0,o.jsx)(`h3`,{className:`text-sm font-semibold mb-2`,children:`Destructive Tone`}),(0,o.jsxs)(`div`,{className:`flex gap-2 flex-wrap`,children:[(0,o.jsx)(a,{variant:`primary`,destructive:!0,children:`Primary`}),(0,o.jsx)(a,{variant:`secondary`,destructive:!0,children:`Secondary`}),(0,o.jsx)(a,{variant:`tertiary`,destructive:!0,children:`Tertiary`}),(0,o.jsx)(a,{variant:`ghost`,destructive:!0,children:`Ghost`}),(0,o.jsx)(a,{variant:`link`,destructive:!0,children:`Link`})]})]}),(0,o.jsxs)(`div`,{children:[(0,o.jsx)(`h3`,{className:`text-sm font-semibold mb-2`,children:`Sizes`}),(0,o.jsxs)(`div`,{className:`flex gap-2 items-center flex-wrap`,children:[(0,o.jsx)(a,{size:`sm`,children:`Small`}),(0,o.jsx)(a,{size:`md`,children:`Medium`}),(0,o.jsx)(a,{size:`lg`,children:`Large`}),(0,o.jsx)(a,{size:`icon`,children:(0,o.jsx)(`svg`,{className:`h-4 w-4`,fill:`none`,stroke:`currentColor`,viewBox:`0 0 24 24`,"aria-hidden":`true`,children:(0,o.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,strokeWidth:2,d:`M12 4v16m8-8H4`})})})]})]}),(0,o.jsxs)(`div`,{children:[(0,o.jsx)(`h3`,{className:`text-sm font-semibold mb-2`,children:`States`}),(0,o.jsxs)(`div`,{className:`flex gap-2 flex-wrap`,children:[(0,o.jsx)(a,{loading:!0,children:`Loading`}),(0,o.jsx)(a,{disabled:!0,children:`Disabled`}),(0,o.jsx)(a,{loading:!0,disabled:!0,children:`Loading Disabled`})]})]})]}),parameters:{layout:`fullscreen`}},k=[`Primary`,`Secondary`,`Tertiary`,`Ghost`,`Destructive`,`Link`,`Small`,`Medium`,`Large`,`Icon`,`Loading`,`Disabled`,`DisabledVisual`,`LoadingDisabled`,`FocusVisible`,`ActionStateMatrix`,`ProductionPrimaryLgFixtures`,`WithIcon`,`FullWidth`,`DarkMode`,`AllVariants`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Primary Button',
    variant: 'primary'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Secondary Button',
    variant: 'secondary'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Tertiary Button',
    variant: 'tertiary'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Ghost Button',
    variant: 'ghost'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Delete',
    variant: 'primary',
    destructive: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Link Button',
    variant: 'link'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Small Button',
    size: 'sm'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Medium Button',
    size: 'md'
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Large Button',
    size: 'lg'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'icon',
    children: <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
      </svg>
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Loading...',
    loading: true
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Disabled Button',
    disabled: true
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Disabled visual spec',
    disabled: true,
    variant: 'primary'
  },
  parameters: {
    docs: {
      description: {
        story: 'Disabled-visual spec: data-state="disabled", --state-disabled-opacity, and --color-text-disabled-token.'
      }
    }
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Loading Disabled',
    loading: true,
    disabled: true
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Focus visible',
    variant: 'primary',
    size: 'lg',
    autoFocus: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Keyboard focus-visible spec: canonical ring-2 focus ring with page-colored offset on the primary/lg master selection.'
      }
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-4 p-6'>
      {BUTTON_VARIANT_NAMES.filter(variant => variant !== 'link').map(variant => <div className='flex flex-wrap items-center gap-3' key={variant}>
            <span className='w-20 text-xs text-tertiary-token'>{variant}</span>
            <Button variant={variant}>Idle</Button>
            <Button variant={variant} loading>
              Loading
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} destructive>
              Destructive
            </Button>
          </div>)}
    </div>,
  parameters: {
    layout: 'padded'
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex flex-col gap-4 p-8'>
      <div>
        <h3 className='text-sm font-semibold mb-2'>
          /download — label override (icon composed in source)
        </h3>
        <Button variant='primary' size='lg' className='gap-2 px-6'>
          <svg className='size-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 3v12m0 0 4-4m-4 4-4-4M4 21h16' />
          </svg>
          Download for Mac
        </Button>
      </div>
      <div>
        <h3 className='text-sm font-semibold mb-2'>
          Footer / final CTA — label override
        </h3>
        <Button variant='primary' size='lg'>
          Get started
        </Button>
      </div>
    </div>,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story: 'Exact production-backed primary/lg selections that resolve to the same Pen master (button/primary/lg/idle) with independent label overrides. The /download leading icon is source-composed child content: live Pen readback shows the master exposes no leading-icon slot, so icon overrides fail closed.'
      }
    }
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    children: <>
        <svg className='h-4 w-4 mr-2' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
        </svg>
        Add Item
      </>
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Full Width Button',
    className: 'w-full'
  },
  parameters: {
    layout: 'padded'
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Button in Dark Mode',
    variant: 'primary'
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex flex-col gap-4 p-8'>
      <div>
        <h3 className='text-sm font-semibold mb-2'>Core Variants</h3>
        <div className='flex gap-2 flex-wrap'>
          <Button variant='primary'>Primary</Button>
          <Button variant='secondary'>Secondary</Button>
          <Button variant='tertiary'>Tertiary</Button>
          <Button variant='ghost'>Ghost</Button>
          <Button variant='link'>Link</Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>Destructive Tone</h3>
        <div className='flex gap-2 flex-wrap'>
          <Button variant='primary' destructive>
            Primary
          </Button>
          <Button variant='secondary' destructive>
            Secondary
          </Button>
          <Button variant='tertiary' destructive>
            Tertiary
          </Button>
          <Button variant='ghost' destructive>
            Ghost
          </Button>
          <Button variant='link' destructive>
            Link
          </Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>Sizes</h3>
        <div className='flex gap-2 items-center flex-wrap'>
          <Button size='sm'>Small</Button>
          <Button size='md'>Medium</Button>
          <Button size='lg'>Large</Button>
          <Button size='icon'>
            <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 4v16m8-8H4' />
            </svg>
          </Button>
        </div>
      </div>

      <div>
        <h3 className='text-sm font-semibold mb-2'>States</h3>
        <div className='flex gap-2 flex-wrap'>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button loading disabled>
            Loading Disabled
          </Button>
        </div>
      </div>
    </div>,
  parameters: {
    layout: 'fullscreen'
  }
}`,...O.parameters?.docs?.source}}}})))()}A();export{C as ActionStateMatrix,O as AllVariants,D as DarkMode,f as Destructive,y as Disabled,b as DisabledVisual,S as FocusVisible,E as FullWidth,d as Ghost,_ as Icon,g as Large,p as Link,v as Loading,x as LoadingDisabled,h as Medium,c as Primary,w as ProductionPrimaryLgFixtures,l as Secondary,m as Small,u as Tertiary,T as WithIcon,k as __namedExportsOrder,s as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./badge-DqMNX1OQ.js";var i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{i=t(),n(),a={title:`UI/Atoms/Badge`,component:r,parameters:{layout:`centered`},tags:[`autodocs`]},o={args:{children:`Beta`}},s={args:{variant:`permission-restricted`,children:`Admin only`},parameters:{docs:{description:{story:`Permission-restricted state using data-state="permission-restricted" and warning tokens.`}}}},c={render:()=>(0,i.jsx)(`div`,{className:`flex flex-wrap items-center gap-2`,children:[[`default`,`Default`],[`secondary`,`Secondary`],[`outline`,`Outline`],[`success`,`Success`],[`warning`,`Warning`],[`destructive`,`Destructive`]].map(([e,t])=>(0,i.jsx)(r,{variant:e,children:t},e))})},l={render:()=>(0,i.jsx)(`div`,{className:`flex items-center gap-2`,children:[`sm`,`md`,`lg`,`xl`].map(e=>(0,i.jsx)(r,{size:e,children:e},e))})},u={render:()=>(0,i.jsx)(`div`,{className:`flex flex-wrap items-center gap-2`,children:[`neutral`,`info`,`success`,`accent`,`warning`,`error`].map(e=>(0,i.jsx)(r,{tone:e,children:e},e))})},d={render:()=>(0,i.jsx)(`div`,{className:`w-28`,children:(0,i.jsx)(r,{variant:`destructive`,children:`Account Deletion Requires Approval`})}),parameters:{docs:{description:{story:`Long destructive labels wrap inside the available width without clipping or overlapping adjacent content.`}}}},f=[`Default`,`PermissionRestricted`,`Variants`,`Sizes`,`Tones`,`ConstrainedDestructiveLabel`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    children: 'Beta'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'permission-restricted',
    children: 'Admin only'
  },
  parameters: {
    docs: {
      description: {
        story: 'Permission-restricted state using data-state="permission-restricted" and warning tokens.'
      }
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex flex-wrap items-center gap-2'>
      {([['default', 'Default'], ['secondary', 'Secondary'], ['outline', 'Outline'], ['success', 'Success'], ['warning', 'Warning'], ['destructive', 'Destructive']] as const).map(([variant, label]) => <Badge key={variant} variant={variant}>
          {label}
        </Badge>)}
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-2'>
      {(['sm', 'md', 'lg', 'xl'] as const).map(size => <Badge key={size} size={size}>
          {size}
        </Badge>)}
    </div>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex flex-wrap items-center gap-2'>
      {(['neutral', 'info', 'success', 'accent', 'warning', 'error'] as const).map(tone => <Badge key={tone} tone={tone}>
          {tone}
        </Badge>)}
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-28'>
      <Badge variant='destructive'>Account Deletion Requires Approval</Badge>
    </div>,
  parameters: {
    docs: {
      description: {
        story: 'Long destructive labels wrap inside the available width without clipping or overlapping adjacent content.'
      }
    }
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as ConstrainedDestructiveLabel,o as Default,s as PermissionRestricted,l as Sizes,u as Tones,c as Variants,f as __namedExportsOrder,a as default};
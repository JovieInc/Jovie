import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./label-CaJvPCxj.js";import{n as i,t as a}from"./input-BYNkmjMu.js";var o,s,c,l,u,d,f;function p(){return(p=e((()=>{o=t(),i(),n(),s={title:`UI/Atoms/Label`,component:r,parameters:{layout:`centered`},tags:[`autodocs`]},c={render:()=>(0,o.jsxs)(`div`,{className:`flex flex-col gap-1`,children:[(0,o.jsx)(r,{htmlFor:`lbl-name`,children:`Display name`}),(0,o.jsx)(a,{id:`lbl-name`})]})},l={render:()=>(0,o.jsxs)(`div`,{className:`flex flex-col gap-1.5`,children:[(0,o.jsx)(r,{htmlFor:`lbl-req`,required:!0,children:`Email`}),(0,o.jsx)(a,{id:`lbl-req`,type:`email`,required:!0,"aria-required":`true`})]})},u={render:()=>(0,o.jsxs)(`div`,{className:`grid gap-3`,children:[(0,o.jsx)(r,{variant:`default`,children:`Default label`}),(0,o.jsx)(r,{variant:`muted`,children:`Optional metadata`}),(0,o.jsx)(r,{variant:`error`,children:`Resolve this field`})]})},d={args:{disabled:!0},render:e=>(0,o.jsxs)(`div`,{className:`flex flex-col gap-1.5`,children:[(0,o.jsx)(r,{...e,htmlFor:`lbl-disabled`,children:`Managed identity`}),(0,o.jsx)(a,{id:`lbl-disabled`,value:`Unavailable`,disabled:!0,readOnly:!0})]})},f=[`Default`,`Required`,`Variants`,`Disabled`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex flex-col gap-1'>
      <Label htmlFor='lbl-name'>Display name</Label>
      <Input id='lbl-name' />
    </div>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex flex-col gap-1.5'>
      <Label htmlFor='lbl-req' required>
        Email
      </Label>
      <Input id='lbl-req' type='email' required aria-required='true' />
    </div>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid gap-3'>
      <Label variant='default'>Default label</Label>
      <Label variant='muted'>Optional metadata</Label>
      <Label variant='error'>Resolve this field</Label>
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true
  },
  render: args => <div className='flex flex-col gap-1.5'>
      <Label {...args} htmlFor='lbl-disabled'>
        Managed identity
      </Label>
      <Input id='lbl-disabled' value='Unavailable' disabled readOnly />
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{c as Default,d as Disabled,l as Required,u as Variants,f as __namedExportsOrder,s as default};
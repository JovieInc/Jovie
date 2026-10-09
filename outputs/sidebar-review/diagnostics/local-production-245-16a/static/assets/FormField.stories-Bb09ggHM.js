import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./input-BYNkmjMu.js";import{n as i,t as a}from"./FormField-Bz2hJlJb.js";var o,s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{o=t(),n(),i(),s={title:`Molecules/FormField`,component:a,parameters:{layout:`centered`}},c={args:{label:`Email Address`,children:(0,o.jsx)(r,{type:`email`,placeholder:`you@example.com`}),className:`w-80`}},l={args:{label:`Username`,required:!0,children:(0,o.jsx)(r,{placeholder:`Enter your username`}),className:`w-80`}},u={args:{label:`Handle`,helpText:`Your unique profile URL. Only letters, numbers, and underscores.`,children:(0,o.jsx)(r,{placeholder:`@yourhandle`}),className:`w-80`}},d={args:{label:`Password`,required:!0,error:`Password must be at least 8 characters.`,children:(0,o.jsx)(r,{type:`password`,placeholder:`Enter password`}),className:`w-80`}},f={args:{label:`Display Name`,required:!0,helpText:`This will be shown on your public profile.`,error:`Display name is required.`,children:(0,o.jsx)(r,{placeholder:`Your display name`}),className:`w-80`}},p={render:()=>(0,o.jsxs)(`form`,{className:`space-y-4 w-80`,children:[(0,o.jsx)(a,{label:`Display Name`,required:!0,children:(0,o.jsx)(r,{placeholder:`John Doe`})}),(0,o.jsx)(a,{label:`Handle`,required:!0,helpText:`Your unique profile URL`,children:(0,o.jsx)(r,{placeholder:`@johndoe`})}),(0,o.jsx)(a,{label:`Bio`,helpText:`Tell fans about yourself (optional)`,children:(0,o.jsx)(r,{placeholder:`Singer, songwriter, producer...`})})]})},m=[`Default`,`Required`,`WithHelpText`,`WithError`,`WithHelpTextAndError`,`FormExample`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Email Address',
    children: <Input type='email' placeholder='you@example.com' />,
    className: 'w-80'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Username',
    required: true,
    children: <Input placeholder='Enter your username' />,
    className: 'w-80'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Handle',
    helpText: 'Your unique profile URL. Only letters, numbers, and underscores.',
    children: <Input placeholder='@yourhandle' />,
    className: 'w-80'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Password',
    required: true,
    error: 'Password must be at least 8 characters.',
    children: <Input type='password' placeholder='Enter password' />,
    className: 'w-80'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Display Name',
    required: true,
    helpText: 'This will be shown on your public profile.',
    error: 'Display name is required.',
    children: <Input placeholder='Your display name' />,
    className: 'w-80'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <form className='space-y-4 w-80'>
      <FormField label='Display Name' required>
        <Input placeholder='John Doe' />
      </FormField>
      <FormField label='Handle' required helpText='Your unique profile URL'>
        <Input placeholder='@johndoe' />
      </FormField>
      <FormField label='Bio' helpText='Tell fans about yourself (optional)'>
        <Input placeholder='Singer, songwriter, producer...' />
      </FormField>
    </form>
}`,...p.parameters?.docs?.source}}}})))()}h();export{c as Default,p as FormExample,l as Required,d as WithError,u as WithHelpText,f as WithHelpTextAndError,m as __namedExportsOrder,s as default};
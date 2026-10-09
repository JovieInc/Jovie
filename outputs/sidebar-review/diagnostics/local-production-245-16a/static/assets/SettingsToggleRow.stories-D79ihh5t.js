import{n as e,s as t}from"./rolldown-runtime-BcKkbAw3.js";import{t as n}from"./react-CFeKwT_a.js";import{t as r}from"./jsx-runtime-BbDfbRii.js";import{n as i,t as a}from"./SettingsToggleRow-BZxCKrgs.js";function o(e){let[t,n]=c.useState(e.checked??!1),r={...e,checked:t,onCheckedChange:t=>{n(t),e.onCheckedChange?.(t)}};return(0,s.jsx)(`div`,{className:`max-w-xl`,children:(0,s.jsx)(a,{...r})})}var s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{s=r(),c=t(n()),i(),l={title:`Dashboard/Molecules/SettingsToggleRow`,component:a,parameters:{layout:`padded`},args:{title:`Enable notifications`,description:`Send me updates about activity and important account changes.`,checked:!0,disabled:!1,ariaLabel:`Enable notifications`},argTypes:{title:{control:`text`},description:{control:`text`},checked:{control:`boolean`},disabled:{control:`boolean`},ariaLabel:{control:`text`},onCheckedChange:{action:`checked-change`}}},u={render:e=>(0,s.jsx)(o,{...e})},d={args:{description:void 0},render:e=>(0,s.jsx)(o,{...e})},f={args:{disabled:!0}},p={args:{title:`Enable notifications`,description:`Send me updates about activity and important account changes.`,gated:!0,gatePlanName:`Pro`,gateFeatureContext:`Notification controls`}},m=[`Default`,`WithoutDescription`,`Disabled`,`Gated`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: args => <ControlledSettingsToggleRow {...args as InteractiveSettingsToggleRowProps} />
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    description: undefined
  },
  render: args => <ControlledSettingsToggleRow {...args as InteractiveSettingsToggleRowProps} />
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Enable notifications',
    description: 'Send me updates about activity and important account changes.',
    gated: true,
    gatePlanName: 'Pro',
    gateFeatureContext: 'Notification controls'
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{u as Default,f as Disabled,p as Gated,d as WithoutDescription,m as __namedExportsOrder,l as default};
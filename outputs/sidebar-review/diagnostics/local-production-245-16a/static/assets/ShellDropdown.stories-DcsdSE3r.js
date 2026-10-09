import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./copy-Ak4aYcMX.js";import{n as a,t as o}from"./trash-DM9Ayg-e.js";import{r as s,t as c}from"./button-BSHhPV4e.js";import{n as l,t as u}from"./ShellDropdown-BrcUgw32.js";function d(){let[e,t]=(0,p.useState)(`newest`);return(0,f.jsx)(u,{trigger:(0,f.jsx)(c,{type:`button`,variant:`secondary`,size:`sm`,children:`Sort`}),defaultOpen:!0,children:(0,f.jsxs)(u.RadioGroup,{value:e,onValueChange:t,children:[(0,f.jsx)(u.RadioItem,{value:`newest`,label:`Newest first`}),(0,f.jsx)(u.RadioItem,{value:`oldest`,label:`Oldest first`})]})})}var f,p,m,h,g,_,v,y;function b(){return(b=e((()=>{f=n(),s(),r(),a(),p=t(),l(),{fn:m}=__STORYBOOK_MODULE_TEST__,h={title:`Shell/ShellDropdown`,component:u,parameters:{layout:`centered`},decorators:[e=>(0,f.jsx)(`div`,{className:`bg-base p-8`,children:(0,f.jsx)(e,{})})]},g={args:{trigger:(0,f.jsx)(c,{type:`button`,variant:`secondary`,size:`sm`,children:`Actions`}),defaultOpen:!0,children:(0,f.jsxs)(f.Fragment,{children:[(0,f.jsx)(u.Item,{label:`Copy link`,icon:i,onSelect:m()}),(0,f.jsx)(u.Separator,{}),(0,f.jsx)(u.Item,{label:`Delete`,icon:o,tone:`danger`,onSelect:m()})]})}},_={args:{trigger:(0,f.jsx)(c,{type:`button`,variant:`secondary`,size:`sm`,children:`Choose a platform`}),defaultOpen:!0,searchable:!0,searchPlaceholder:`Search platforms…`,children:(0,f.jsxs)(f.Fragment,{children:[(0,f.jsx)(u.Item,{label:`Spotify`,onSelect:m()}),(0,f.jsx)(u.Item,{label:`Apple Music`,onSelect:m()}),(0,f.jsx)(u.Item,{label:`YouTube Music`,onSelect:m()})]})}},v={args:{trigger:(0,f.jsx)(c,{type:`button`,variant:`secondary`,size:`sm`,children:`Sort`}),children:null},render:()=>(0,f.jsx)(d,{})},y=[`Default`,`Searchable`,`WithRadioGroup`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    trigger: <Button type='button' variant='secondary' size='sm'>
        Actions
      </Button>,
    defaultOpen: true,
    children: <>
        <ShellDropdown.Item label='Copy link' icon={Copy} onSelect={fn()} />
        <ShellDropdown.Separator />
        <ShellDropdown.Item label='Delete' icon={Trash2} tone='danger' onSelect={fn()} />
      </>
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    trigger: <Button type='button' variant='secondary' size='sm'>
        Choose a platform
      </Button>,
    defaultOpen: true,
    searchable: true,
    searchPlaceholder: 'Search platforms…',
    children: <>
        <ShellDropdown.Item label='Spotify' onSelect={fn()} />
        <ShellDropdown.Item label='Apple Music' onSelect={fn()} />
        <ShellDropdown.Item label='YouTube Music' onSelect={fn()} />
      </>
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    trigger: <Button type='button' variant='secondary' size='sm'>
        Sort
      </Button>,
    children: null
  },
  render: () => <RadioGroupDemo />
}`,...v.parameters?.docs?.source}}}})))()}b();export{g as Default,_ as Searchable,v as WithRadioGroup,y as __namedExportsOrder,h as default};
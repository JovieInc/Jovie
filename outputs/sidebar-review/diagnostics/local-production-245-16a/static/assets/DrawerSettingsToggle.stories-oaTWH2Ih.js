import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerSettingsToggle-BxV3qHsx.js";var i,a,o,s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Molecules/Drawer/DrawerSettingsToggle`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-72 bg-surface-0 p-3`,children:(0,i.jsx)(e,{})})],args:{label:`Show on profile`,ariaLabel:`Show on profile`,checked:!1,onCheckedChange:o()}},u={play:async({canvasElement:e,args:t})=>{let n=c(e).getByRole(`switch`);await s.click(n),await a(t.onCheckedChange).toHaveBeenCalledWith(!0)}},d={args:{checked:!0}},f={args:{disabled:!0}},p={args:{density:`compact`}},m=[`Default`,`Checked`,`Disabled`,`CompactDensity`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    checked: true
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact'
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{d as Checked,p as CompactDensity,u as Default,f as Disabled,m as __namedExportsOrder,l as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./settings-BcsOcbVa.js";import{n as i,t as a}from"./DrawerButton-B_zB1QiP.js";var o,s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{o=t(),n(),i(),{expect:s,fn:c,userEvent:l,within:u}=__STORYBOOK_MODULE_TEST__,d={title:`Molecules/Drawer/DrawerButton`,component:a,parameters:{layout:`centered`},args:{type:`button`,children:`Save changes`,onClick:c()}},f={play:async({canvasElement:e,args:t})=>{let n=u(e).getByRole(`button`,{name:`Save changes`});await l.click(n),await s(t.onClick).toHaveBeenCalled()}},p={args:{tone:`primary`}},m={args:{tone:`ghost`,children:`View details`}},h={render:()=>(0,o.jsx)(a,{size:`icon`,"aria-label":`Open settings`,children:(0,o.jsx)(r,{"aria-hidden":`true`})})},g={args:{disabled:!0},play:async({canvasElement:e})=>{await s(u(e).getByRole(`button`,{name:`Save changes`})).toBeDisabled()}},_=[`Secondary`,`Primary`,`Ghost`,`IconOnly`,`Disabled`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const save = within(canvasElement).getByRole('button', {
      name: 'Save changes'
    });
    await userEvent.click(save);
    await expect(args.onClick).toHaveBeenCalled();
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    tone: 'primary'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    tone: 'ghost',
    children: 'View details'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <DrawerButton size='icon' aria-label='Open settings'>
      <Settings aria-hidden='true' />
    </DrawerButton>
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true
  },
  play: async ({
    canvasElement
  }) => {
    await expect(within(canvasElement).getByRole('button', {
      name: 'Save changes'
    })).toBeDisabled();
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{g as Disabled,m as Ghost,h as IconOnly,p as Primary,f as Secondary,_ as __namedExportsOrder,d as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./copy-Ak4aYcMX.js";import{n as i,t as a}from"./DrawerInlineIconButton-CdqfaOnl.js";var o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{o=t(),n(),i(),{expect:s,fn:c,userEvent:l,within:u}=__STORYBOOK_MODULE_TEST__,d={title:`Molecules/Drawer/DrawerInlineIconButton`,component:a,parameters:{layout:`centered`},decorators:[e=>(0,o.jsx)(`div`,{className:`bg-surface-0 p-3`,children:(0,o.jsx)(e,{})})],args:{"aria-label":`Copy link`,onClick:c(),children:(0,o.jsx)(r,{className:`h-3.5 w-3.5`})}},f={play:async({canvasElement:e,args:t})=>{let n=u(e).getByRole(`button`,{name:`Copy link`});await l.click(n),await s(t.onClick).toHaveBeenCalled()}},p={args:{fadeOnParentHover:!0}},m={args:{"aria-label":`Open profile`},render:()=>(0,o.jsx)(a,{href:`https://jov.ie/tim`,"aria-label":`Open profile`,children:(0,o.jsx)(r,{className:`h-3.5 w-3.5`})})},h=[`Default`,`FadeOnParentHover`,`AsLink`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Copy link'
    });
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalled();
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    fadeOnParentHover: true
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    'aria-label': 'Open profile'
  },
  render: () => <DrawerInlineIconButton href='https://jov.ie/tim' aria-label='Open profile'>
      <Copy className='h-3.5 w-3.5' />
    </DrawerInlineIconButton>
}`,...m.parameters?.docs?.source}}}})))()}g();export{m as AsLink,f as Default,p as FadeOnParentHover,h as __namedExportsOrder,d as default};
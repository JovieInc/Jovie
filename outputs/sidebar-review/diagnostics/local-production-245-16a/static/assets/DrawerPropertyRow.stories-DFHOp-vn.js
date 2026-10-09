import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerPropertyRow-Cy5f2ZCe.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Molecules/Drawer/DrawerPropertyRow`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-full max-w-md bg-surface-0 p-3`,children:e()})],args:{label:`Release status`,value:`Ready for review`}},u={},d={args:{interactive:!0,onClick:o(),label:`Open release`,value:`Summer EP`},play:async({canvasElement:e,args:t})=>{let n=c(e).getByRole(`button`,{name:`Open release Summer EP`});await s.click(n),await a(t.onClick).toHaveBeenCalled()}},f={args:{size:`sm`,align:`start`,labelWidth:120,label:`Description`,value:`A short release summary.`}},p=[`ReadOnly`,`Interactive`,`Compact`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    interactive: true,
    onClick: fn(),
    label: 'Open release',
    value: 'Summer EP'
  },
  play: async ({
    canvasElement,
    args
  }) => {
    const property = within(canvasElement).getByRole('button', {
      name: 'Open release Summer EP'
    });
    await userEvent.click(property);
    await expect(args.onClick).toHaveBeenCalled();
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    size: 'sm',
    align: 'start',
    labelWidth: 120,
    label: 'Description',
    value: 'A short release summary.'
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{f as Compact,d as Interactive,u as ReadOnly,p as __namedExportsOrder,l as default};
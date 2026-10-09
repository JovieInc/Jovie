import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./arrow-right-Cl8JKg4j.js";import{n as i,t as a}from"./link-2-BbP9M1Y9.js";import{n as o,t as s}from"./DrawerActionRow-FBp6Q6WY.js";var c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{c=t(),n(),i(),o(),{expect:l,fn:u,userEvent:d,within:f}=__STORYBOOK_MODULE_TEST__,p={title:`Molecules/Drawer/DrawerActionRow`,component:s,parameters:{layout:`centered`},decorators:[e=>(0,c.jsx)(`div`,{className:`w-full max-w-sm bg-surface-0 p-3`,children:e()})],args:{label:`Open public profile`,onClick:u(),icon:(0,c.jsx)(a,{"aria-hidden":`true`,className:`size-3.5`}),trailing:(0,c.jsx)(r,{"aria-hidden":`true`,className:`size-3.5`})}},m={play:async({canvasElement:e,args:t})=>{let n=f(e).getByRole(`button`,{name:`Open public profile`});await d.click(n),await l(t.onClick).toHaveBeenCalled()}},h={args:{label:`Edit profile details`,trailing:void 0}},g={args:{label:`View release notes`,icon:void 0,trailing:void 0}},_=[`Default`,`WithoutTrailingAction`,`TextOnly`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const action = within(canvasElement).getByRole('button', {
      name: 'Open public profile'
    });
    await userEvent.click(action);
    await expect(args.onClick).toHaveBeenCalled();
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Edit profile details',
    trailing: undefined
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'View release notes',
    icon: undefined,
    trailing: undefined
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{m as Default,g as TextOnly,h as WithoutTrailingAction,_ as __namedExportsOrder,p as default};
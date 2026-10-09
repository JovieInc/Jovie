import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./DrawerBackButton-gBJXY7Dg.js";var r,i,a,o,s,c,l,u;function d(){return(d=e((()=>{t(),{expect:r,fn:i,userEvent:a,within:o}=__STORYBOOK_MODULE_TEST__,s={title:`Molecules/Drawer/DrawerBackButton`,component:n,parameters:{layout:`centered`},args:{label:`Back to artist`,onClick:i()}},c={play:async({canvasElement:e,args:t})=>{let n=o(e).getByRole(`button`,{name:`Back to artist`});await r(n.querySelector(`[aria-hidden="true"]`)).not.toBeNull(),await a.click(n),await r(t.onClick).toHaveBeenCalled()}},l={args:{label:`Back to the artist release workspace`}},u=[`Default`,`LongLabel`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const back = within(canvasElement).getByRole('button', {
      name: 'Back to artist'
    });
    await expect(back.querySelector('[aria-hidden="true"]')).not.toBeNull();
    await userEvent.click(back);
    await expect(args.onClick).toHaveBeenCalled();
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Back to the artist release workspace'
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as Default,l as LongLabel,u as __namedExportsOrder,s as default};
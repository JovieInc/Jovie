import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerButton-B_zB1QiP.js";import{n as i,t as a}from"./DrawerSection-DFpl4ECn.js";var o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{o=t(),n(),i(),{expect:s,userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u={title:`Molecules/Drawer/DrawerSection`,component:a,parameters:{layout:`centered`},decorators:[e=>(0,o.jsx)(`div`,{className:`w-80 bg-surface-0`,children:(0,o.jsx)(e,{})})],args:{title:`Metadata`,children:(0,o.jsx)(`p`,{className:`text-sm text-secondary-token`,children:`Section content goes here.`})}},d={},f={args:{surface:`card`}},p={args:{defaultOpen:!1},play:async({canvasElement:e})=>{let t=l(e).getByRole(`button`,{name:`Metadata`});await s(t).toHaveAttribute(`aria-expanded`,`false`),await c.click(t),await s(t).toHaveAttribute(`aria-expanded`,`true`)}},m={args:{collapsible:!1}},h={args:{actions:(0,o.jsx)(r,{tone:`ghost`,size:`sm`,children:`Edit`})}},g=[`Plain`,`Card`,`Collapsed`,`NotCollapsible`,`WithActions`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    surface: 'card'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    defaultOpen: false
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', {
      name: 'Metadata'
    });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    collapsible: false
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    actions: <DrawerButton tone='ghost' size='sm'>
        Edit
      </DrawerButton>
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{f as Card,p as Collapsed,m as NotCollapsible,d as Plain,h as WithActions,g as __namedExportsOrder,u as default};
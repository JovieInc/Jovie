import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,n as r,r as i,t as a}from"./DrawerSection-DFpl4ECn.js";var o,s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{o=t(),r(),n(),{expect:s,userEvent:c,within:l}=__STORYBOOK_MODULE_TEST__,u={title:`Molecules/Drawer/DrawerSectionGroup`,component:i,parameters:{layout:`centered`},decorators:[e=>(0,o.jsx)(`div`,{className:`w-80 space-y-2 bg-surface-0`,children:(0,o.jsx)(e,{})})],args:{children:(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(a,{title:`Facts`,sectionId:`facts`,children:(0,o.jsx)(`p`,{className:`text-sm text-secondary-token`,children:`Fact content.`})}),(0,o.jsx)(a,{title:`Links`,sectionId:`links`,children:(0,o.jsx)(`p`,{className:`text-sm text-secondary-token`,children:`Link content.`})})]})}},d={},f={args:{defaultOpenSectionId:`facts`}},p={args:{defaultOpenSectionId:`facts`},play:async({canvasElement:e})=>{let t=l(e),n=t.getByRole(`button`,{name:`Facts`}),r=t.getByRole(`button`,{name:`Links`});await s(n).toHaveAttribute(`aria-expanded`,`true`),await c.click(r),await s(r).toHaveAttribute(`aria-expanded`,`true`),await s(n).toHaveAttribute(`aria-expanded`,`false`)}},m=[`AllCollapsed`,`OneOpenByDefault`,`OpeningOneClosesTheOther`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    defaultOpenSectionId: 'facts'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    defaultOpenSectionId: 'facts'
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const factsTrigger = canvas.getByRole('button', {
      name: 'Facts'
    });
    const linksTrigger = canvas.getByRole('button', {
      name: 'Links'
    });
    await expect(factsTrigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(linksTrigger);
    await expect(linksTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(factsTrigger).toHaveAttribute('aria-expanded', 'false');
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{d as AllCollapsed,f as OneOpenByDefault,p as OpeningOneClosesTheOther,m as __namedExportsOrder,u as default};
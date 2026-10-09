import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerFormGridRow-ClTrRFVY.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),{expect:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={title:`Molecules/Drawer/DrawerFormGridRow`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-full max-w-md`,children:e()})],args:{label:`Release date`,htmlFor:`release-date`,children:(0,i.jsx)(`input`,{id:`release-date`,className:`h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token`,defaultValue:`2026-09-12`})}},l={play:async({canvasElement:e})=>{let t=s(e).getByLabelText(`Release date`);await a(t).toHaveAttribute(`id`,`release-date`),await o.click(t),await a(t).toHaveFocus()}},u={args:{label:`Distribution`,htmlFor:`distribution`,labelClassName:`text-secondary-token`,children:(0,i.jsx)(`input`,{id:`distribution`,className:`h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token`,defaultValue:`Worldwide`})}},d=[`Default`,`CustomLabelStyle`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const field = within(canvasElement).getByLabelText('Release date');
    await expect(field).toHaveAttribute('id', 'release-date');
    await userEvent.click(field);
    await expect(field).toHaveFocus();
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Distribution',
    htmlFor: 'distribution',
    labelClassName: 'text-secondary-token',
    children: <input id='distribution' className='h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token' defaultValue='Worldwide' />
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{u as CustomLabelStyle,l as Default,d as __namedExportsOrder,c as default};
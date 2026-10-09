import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerFormField-BEDmoTfg.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),{expect:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={title:`Molecules/Drawer/DrawerFormField`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-full max-w-sm`,children:e()})],args:{label:`Profile URL`,htmlFor:`profile-url`,helperText:`Use the public URL customers already know.`,children:(0,i.jsx)(`input`,{id:`profile-url`,className:`h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token`,defaultValue:`jovie.com/tim`})}},l={play:async({canvasElement:e})=>{let t=s(e).getByLabelText(`Profile URL`);await a(t).toHaveAttribute(`id`,`profile-url`),await o.click(t),await a(t).toHaveFocus()}},u={args:{label:`Display name`,htmlFor:`display-name`,helperText:void 0,children:(0,i.jsx)(`input`,{id:`display-name`,className:`h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token`,defaultValue:`Tim White`})}},d=[`WithHelperText`,`WithoutHelperText`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const field = within(canvasElement).getByLabelText('Profile URL');
    await expect(field).toHaveAttribute('id', 'profile-url');
    await userEvent.click(field);
    await expect(field).toHaveFocus();
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Display name',
    htmlFor: 'display-name',
    helperText: undefined,
    children: <input id='display-name' className='h-8 w-full rounded-md border border-subtle bg-surface-0 px-2 text-sm text-primary-token' defaultValue='Tim White' />
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{l as WithHelperText,u as WithoutHelperText,d as __namedExportsOrder,c as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerEditableTextField-BIkgeV9J.js";var i,a,o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Molecules/Drawer/DrawerEditableTextField`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-72 bg-surface-0 p-3`,children:(0,i.jsx)(e,{})})],args:{label:`Display name`,value:`Tim White`,editable:!0,onSave:o(()=>Promise.resolve())}},u={},d={args:{editable:!1}},f={args:{value:null,emptyLabel:`Add a display name`}},p={args:{label:`Profile URL`,value:`jov.ie/tim`,copyValue:`https://jov.ie/tim`}},m={play:async({canvasElement:e,args:t})=>{let n=c(e),r=n.getByRole(`button`,{name:`Edit Display name`});await s.click(r);let i=n.getByRole(`textbox`,{name:`Edit Display name`});await s.clear(i),await s.type(i,`Tim W.{Enter}`),await a(t.onSave).toHaveBeenCalledWith(`Tim W.`)}},h=[`Default`,`ReadOnly`,`Empty`,`WithCopyAction`,`EditingCommitsOnEnter`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    editable: false
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    value: null,
    emptyLabel: 'Add a display name'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Profile URL',
    value: 'jov.ie/tim',
    copyValue: 'https://jov.ie/tim'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', {
      name: 'Edit Display name'
    });
    await userEvent.click(trigger);
    const input = canvas.getByRole('textbox', {
      name: 'Edit Display name'
    });
    await userEvent.clear(input);
    await userEvent.type(input, 'Tim W.{Enter}');
    await expect(args.onSave).toHaveBeenCalledWith('Tim W.');
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{u as Default,m as EditingCommitsOnEnter,f as Empty,d as ReadOnly,p as WithCopyAction,h as __namedExportsOrder,l as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerAsyncToggle-Cz9utGU1.js";var i,a,o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,waitFor:c,within:l}=__STORYBOOK_MODULE_TEST__,u={title:`Molecules/Drawer/DrawerAsyncToggle`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-72 bg-surface-0 p-3`,children:(0,i.jsx)(e,{})})],args:{label:`Show on profile`,ariaLabel:`Show on profile`,checked:!1,onToggle:o(()=>Promise.resolve())}},d={play:async({canvasElement:e,args:t})=>{let n=l(e).getByRole(`switch`);await s.click(n),await a(t.onToggle).toHaveBeenCalledWith(!0)}},f={args:{checked:!0}},p={args:{density:`compact`}},m={args:{onToggle:o(()=>Promise.reject(Error(`save failed`)))},play:async({canvasElement:e,args:t})=>{let n=l(e).getByRole(`switch`);await s.click(n),await a(t.onToggle).toHaveBeenCalledWith(!0),await c(()=>a(n).toHaveAttribute(`aria-checked`,`false`))}},h=[`Default`,`Checked`,`CompactDensity`,`RejectedToggleRevertsState`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await expect(args.onToggle).toHaveBeenCalledWith(true);
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    checked: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    onToggle: fn(() => Promise.reject(new Error('save failed')))
  },
  play: async ({
    canvasElement,
    args
  }) => {
    const toggle = within(canvasElement).getByRole('switch');
    await userEvent.click(toggle);
    await expect(args.onToggle).toHaveBeenCalledWith(true);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{f as Checked,p as CompactDensity,d as Default,m as RejectedToggleRevertsState,h as __namedExportsOrder,u as default};
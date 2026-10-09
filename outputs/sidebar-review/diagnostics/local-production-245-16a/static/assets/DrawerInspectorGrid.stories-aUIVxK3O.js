import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./DrawerInspectorGrid-8h9SPwMT.js";import{n as i,t as a}from"./DrawerPropertyRow-Cy5f2ZCe.js";var o,s,c,l,u,d,f;function p(){return(p=e((()=>{o=t(),n(),i(),{expect:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Molecules/Drawer/DrawerInspectorGrid`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,o.jsx)(`div`,{className:`w-full max-w-md bg-surface-0 p-3`,children:e()})],args:{children:(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(a,{label:`Status`,value:`Ready`}),(0,o.jsx)(a,{label:`Audience`,value:`1,240 contacts`})]}),"data-testid":`inspector-grid`}},u={play:async({canvasElement:e})=>{let t=c(e);await s(t.getByTestId(`inspector-grid`)).toHaveTextContent(`Ready`),await s(t.queryByRole(`button`)).not.toBeInTheDocument()}},d={args:{labelWidth:128}},f=[`Default`,`WiderLabels`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('inspector-grid')).toHaveTextContent('Ready');
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    labelWidth: 128
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{u as Default,d as WiderLabels,f as __namedExportsOrder,l as default};
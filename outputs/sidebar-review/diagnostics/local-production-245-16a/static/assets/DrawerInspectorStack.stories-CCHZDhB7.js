import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";import{n as i,t as a}from"./DrawerPropertyRow-Cy5f2ZCe.js";function o({children:e,className:t,"data-testid":n}){return(0,s.jsx)(`div`,{"data-testid":n,className:r(`space-y-2`,t),children:e})}var s;function c(){return(c=e((()=>{s=t(),n()})))()}var l,u,d,f,p,m,h;function g(){return(g=e((()=>{l=t(),c(),i(),{expect:u,within:d}=__STORYBOOK_MODULE_TEST__,f={title:`Molecules/Drawer/DrawerInspectorStack`,component:o,parameters:{layout:`centered`},decorators:[e=>(0,l.jsx)(`div`,{className:`w-full max-w-md bg-surface-0 p-3`,children:e()})],args:{children:(0,l.jsxs)(l.Fragment,{children:[(0,l.jsx)(a,{label:`Release`,value:`Summer EP`}),(0,l.jsx)(a,{label:`Status`,value:`Draft`})]}),"data-testid":`inspector-stack`}},p={play:async({canvasElement:e})=>{let t=d(e);await u(t.getByTestId(`inspector-stack`)).toHaveTextContent(`Draft`),await u(t.queryByRole(`button`)).not.toBeInTheDocument()}},m={args:{className:`space-y-4`}},h=[`Default`,`WithCustomSpacing`],p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('inspector-stack')).toHaveTextContent('Draft');
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    className: 'space-y-4'
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{p as Default,m as WithCustomSpacing,h as __namedExportsOrder,f as default};
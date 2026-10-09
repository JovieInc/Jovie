import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ShareableLinkRow-Bzlzd2Uh.js";var i,a,o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Molecules/Drawer/ShareableLinkRow`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-72 bg-surface-1 p-3`,children:(0,i.jsx)(e,{})})],args:{url:`https://jov.ie/tim`,onCopy:o(()=>Promise.resolve()),onCopySuccess:o(),onCopyError:o()}},u={play:async({canvasElement:e,args:t})=>{let n=c(e).getByRole(`button`,{name:`Copy link`});await s.click(n),await a(t.onCopySuccess).toHaveBeenCalled()}},d={args:{density:`compact`}},f={args:{density:`table`}},p={args:{surface:`flat`}},m={args:{actionsVisibility:`hover`}},h={args:{showOpen:!1}},g=[`Rail`,`Compact`,`Table`,`FlatSurface`,`HoverOnlyActions`,`NoOpenButton`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const canvas = within(canvasElement);
    const copyButton = canvas.getByRole('button', {
      name: 'Copy link'
    });
    await userEvent.click(copyButton);
    await expect(args.onCopySuccess).toHaveBeenCalled();
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'table'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    surface: 'flat'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    actionsVisibility: 'hover'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    showOpen: false
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{d as Compact,p as FlatSurface,m as HoverOnlyActions,h as NoOpenButton,u as Rail,f as Table,g as __namedExportsOrder,l as default};
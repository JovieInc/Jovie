import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./FilterSearchInput-ADI78m3P.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Molecules/Filters/FilterSearchInput`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-56`,children:(0,i.jsx)(e,{})})],args:{value:``,onChange:o(),onClear:o()}},u={play:async({canvasElement:e,args:t})=>{let n=c(e).getByRole(`textbox`);await s.type(n,`a`),await a(t.onChange).toHaveBeenCalledWith(`a`)}},d={args:{value:`genre`},play:async({canvasElement:e,args:t})=>{let n=c(e).getByRole(`button`,{name:`Clear Search`});await s.click(n),await a(t.onClear).toHaveBeenCalled()}},f={args:{placeholder:`Filter genres...`}},p=[`Empty`,`WithValue`,`CustomPlaceholder`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const input = within(canvasElement).getByRole('textbox');
    await userEvent.type(input, 'a');
    await expect(args.onChange).toHaveBeenCalledWith('a');
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'genre'
  },
  play: async ({
    canvasElement,
    args
  }) => {
    const clearButton = within(canvasElement).getByRole('button', {
      name: 'Clear Search'
    });
    await userEvent.click(clearButton);
    await expect(args.onClear).toHaveBeenCalled();
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    placeholder: 'Filter genres...'
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{f as CustomPlaceholder,u as Empty,d as WithValue,p as __namedExportsOrder,l as default};
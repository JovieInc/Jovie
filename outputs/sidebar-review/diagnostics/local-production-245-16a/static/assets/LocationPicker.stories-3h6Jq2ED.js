import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{n as i,t as a}from"./LocationPicker-i0WCpARJ.js";var o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{o=t(),n(),i(),{expect:s,fn:c,userEvent:l,within:u}=__STORYBOOK_MODULE_TEST__,d={title:`Molecules/LocationPicker`,component:a,parameters:{layout:`centered`},args:{value:null,onSelect:c(),trigger:(0,o.jsx)(r,{variant:`outline`,size:`sm`,children:`Choose a city`})}},f={},p={play:async({canvasElement:e})=>{let t=u(e).getByRole(`button`,{name:`Choose a city`});await l.click(t),await s(u(document.body).getByPlaceholderText(`Search cities...`)).toBeInTheDocument()}},m={args:{value:`los angeles, ca`}},h={args:{placeholder:`Where do you perform?`}},g=[`Closed`,`Open`,`WithSelectedValue`,`CustomPlaceholder`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose a city'
    });
    await userEvent.click(trigger);
    await expect(within(document.body).getByPlaceholderText('Search cities...')).toBeInTheDocument();
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'los angeles, ca'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    placeholder: 'Where do you perform?'
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{f as Closed,h as CustomPlaceholder,p as Open,m as WithSelectedValue,g as __namedExportsOrder,d as default};
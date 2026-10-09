import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{n as i,t as a}from"./GenrePicker-BdfnTIQx.js";var o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{o=t(),n(),i(),{expect:s,fn:c,userEvent:l,within:u}=__STORYBOOK_MODULE_TEST__,d={title:`Molecules/GenrePicker`,component:a,parameters:{layout:`centered`},args:{selected:[],onChange:c(),trigger:(0,o.jsx)(r,{variant:`outline`,size:`sm`,children:`Choose genres`})}},f={},p={play:async({canvasElement:e})=>{let t=u(e).getByRole(`button`,{name:`Choose genres`});await l.click(t),await s(u(document.body).getByPlaceholderText(`Search genres...`)).toBeInTheDocument()}},m={args:{selected:[`pop`,`r&b`]}},h={args:{selected:[`pop`,`r&b`,`hip hop`],maxGenres:3},play:async({canvasElement:e})=>{let t=u(e).getByRole(`button`,{name:`Choose genres`});await l.click(t),await s(u(document.body).getByText(`Maximum 3 genres reached`)).toBeInTheDocument()}},g=[`Closed`,`Open`,`WithSelection`,`AtMaxGenres`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose genres'
    });
    await userEvent.click(trigger);
    await expect(within(document.body).getByPlaceholderText('Search genres...')).toBeInTheDocument();
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    selected: ['pop', 'r&b']
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    selected: ['pop', 'r&b', 'hip hop'],
    maxGenres: 3
  },
  play: async ({
    canvasElement
  }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Choose genres'
    });
    await userEvent.click(trigger);
    await expect(within(document.body).getByText('Maximum 3 genres reached')).toBeInTheDocument();
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{h as AtMaxGenres,f as Closed,p as Open,m as WithSelection,g as __namedExportsOrder,d as default};
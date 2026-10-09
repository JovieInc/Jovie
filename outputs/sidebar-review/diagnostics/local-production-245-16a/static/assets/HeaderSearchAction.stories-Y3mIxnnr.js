import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./HeaderSearchAction-dvOFR8XU.js";var r,i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{t(),{expect:r,fn:i,userEvent:a,within:o}=__STORYBOOK_MODULE_TEST__,s={title:`Molecules/HeaderSearchAction`,component:n,parameters:{layout:`centered`},args:{searchValue:``,onSearchValueChange:i(),placeholder:`Search releases...`,ariaLabel:`Search releases`,submitAriaLabel:`Open search`}},c={play:async({canvasElement:e})=>{let t=o(e),n=t.getByRole(`button`,{name:`Open search`});await a.click(n),await r(t.getByRole(`searchbox`,{name:`Search releases`})).toBeInTheDocument()}},l={args:{alwaysOpen:!0}},u={args:{alwaysOpen:!0,searchValue:`midnight`}},d=[`Collapsed`,`AlwaysOpen`,`WithValue`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', {
      name: 'Open search'
    });
    await userEvent.click(trigger);
    await expect(canvas.getByRole('searchbox', {
      name: 'Search releases'
    })).toBeInTheDocument();
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    alwaysOpen: true
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    alwaysOpen: true,
    searchValue: 'midnight'
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{l as AlwaysOpen,c as Collapsed,u as WithValue,d as __namedExportsOrder,s as default};
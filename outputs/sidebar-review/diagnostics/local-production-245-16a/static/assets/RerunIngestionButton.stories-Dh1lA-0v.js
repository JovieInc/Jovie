import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./RerunIngestionButton-_YUzJRRM.js";var r,i,a,o,s,c,l;function u(){return(u=e((()=>{t(),{expect:r,userEvent:i,within:a}=__STORYBOOK_MODULE_TEST__,o={title:`Features/Admin/CustomerRecovery/RerunIngestionButton`,component:n,parameters:{layout:`centered`},args:{creatorProfileId:`cp-1`}},s={},c={play:async({canvasElement:e})=>{let t=a(e);await i.click(t.getByRole(`button`,{name:`Re-run Artist Ingestion`})),await r(await t.findByText(/Recovery requested/)).toBeInTheDocument()}},l=[`Default`,`Requested`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', {
      name: 'Re-run Artist Ingestion'
    }));
    await expect(await canvas.findByText(/Recovery requested/)).toBeInTheDocument();
  }
}`,...c.parameters?.docs?.source}}}})))()}u();export{s as Default,c as Requested,l as __namedExportsOrder,o as default};
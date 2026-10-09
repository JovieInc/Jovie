import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./IngestProfileDropdown-DxZg48hO.js";var r,i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{t(),{expect:r,fn:i,userEvent:a,within:o}=__STORYBOOK_MODULE_TEST__,s={title:`Features/Admin/IngestProfileDropdown`,component:n,parameters:{layout:`centered`},args:{onIngestPending:i(),hideLabelOnMobile:!1}},c={},l={play:async({canvasElement:e})=>{let t=o(e);await a.click(t.getByRole(`button`,{name:`Ingest Profile`}));let n=o(e.ownerDocument.body);await r(await n.findByText(`Ingest social profile`)).toBeInTheDocument()}},u={args:{hideLabelOnMobile:!0}},d=[`Default`,`Open`,`CompactLabel`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', {
      name: 'Ingest Profile'
    }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText('Ingest social profile')).toBeInTheDocument();
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    hideLabelOnMobile: true
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{u as CompactLabel,c as Default,l as Open,d as __namedExportsOrder,s as default};
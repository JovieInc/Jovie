import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./DocToolbar-D9ZDceij.js";var r,i,a,o,s,c,l,u;function d(){return(d=e((()=>{t(),{expect:r,userEvent:i,within:a}=__STORYBOOK_MODULE_TEST__,o={title:`Molecules/DocToolbar`,component:n,parameters:{layout:`centered`},args:{pdfTitle:`Jovie Terms of Service`}},s={play:async({canvasElement:e})=>{let t=a(e);await r(t.getByRole(`button`,{name:/print/i})).toBeInTheDocument(),await r(t.getByRole(`button`,{name:/download pdf/i})).toBeInTheDocument()}},c={args:{pdfTitle:`Jovie Data Processing Addendum and Sub-processor List`}},l={play:async({canvasElement:e})=>{let t=a(e).getByRole(`button`,{name:/print/i}),n=globalThis.print;globalThis.print=()=>{},await i.click(t),globalThis.print=n}},u=[`Default`,`LongTitle`,`PrintInteraction`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', {
      name: /print/i
    })).toBeInTheDocument();
    await expect(canvas.getByRole('button', {
      name: /download pdf/i
    })).toBeInTheDocument();
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    pdfTitle: 'Jovie Data Processing Addendum and Sub-processor List'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const printButton = canvas.getByRole('button', {
      name: /print/i
    });
    const originalPrint = globalThis.print;
    globalThis.print = () => {};
    await userEvent.click(printButton);
    globalThis.print = originalPrint;
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{s as Default,c as LongTitle,l as PrintInteraction,u as __namedExportsOrder,o as default};
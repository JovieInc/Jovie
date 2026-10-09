import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./ArtistProfileRailToggle-DB605Yb6.js";import{i as r,r as i}from"./dashboard-fixtures-Dl8rldOO.js";var a,o,s,c,l,u;function d(){return(d=e((()=>{i(),t(),{expect:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={title:`Shell/ArtistProfileRailToggle`,component:n,parameters:{layout:`centered`},decorators:[r]},l={play:async({canvasElement:e})=>{let t=s(e).getByRole(`button`);await a(t).toHaveAttribute(`aria-pressed`,`false`),await o.click(t),await a(t).toHaveAttribute(`aria-pressed`,`true`),await o.click(t),await a(t).toHaveAttribute(`aria-pressed`,`false`)}},u=[`Reversible`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const button = within(canvasElement).getByRole('button');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{l as Reversible,u as __namedExportsOrder,c as default};
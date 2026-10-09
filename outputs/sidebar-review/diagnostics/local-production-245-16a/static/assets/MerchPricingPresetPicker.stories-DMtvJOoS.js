import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./MerchPricingPresetPicker-FjxeBIDP.js";var r,i,a,o,s,c,l,u;function d(){return(d=e((()=>{t(),{expect:r,fn:i,userEvent:a,within:o}=__STORYBOOK_MODULE_TEST__,s={title:`Molecules/MerchPricingPresetPicker`,component:n,parameters:{layout:`centered`},args:{options:[{preset:`safe`,label:`Safe`,salePrice:`$24`,profit:`$6`},{preset:`standard`,label:`Standard`,salePrice:`$28`,profit:`$10`},{preset:`aggressive`,label:`Aggressive`,salePrice:`$32`,profit:`$14`}],value:`standard`,onChange:i()}},c={play:async({canvasElement:e,args:t})=>{let n=o(e).getByRole(`radio`,{name:`Aggressive`});await a.click(n),await r(t.onChange).toHaveBeenCalledWith(`aggressive`)}},l={args:{value:`safe`}},u=[`Default`,`SafeSelected`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const canvas = within(canvasElement);
    const aggressive = canvas.getByRole('radio', {
      name: 'Aggressive'
    });
    await userEvent.click(aggressive);
    await expect(args.onChange).toHaveBeenCalledWith('aggressive');
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    value: 'safe'
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as Default,l as SafeSelected,u as __namedExportsOrder,s as default};
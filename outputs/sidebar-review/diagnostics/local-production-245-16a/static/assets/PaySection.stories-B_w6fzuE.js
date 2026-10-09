import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./PaySection-CY3jVis7.js";var i,a,o,s,c,l,u,d,f,p,m,h,g,_,v;function y(){return(y=e((()=>{i=t(),n(),a={title:`Organisms/PaySection`,component:r,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{amounts:{control:{type:`object`}}}},o=async e=>{await new Promise(e=>setTimeout(e,2e3))},s=e=>{},c={args:{handle:`taylorswift`,onStripePayment:o}},l={args:{handle:`edsheeran`,venmoLink:`https://venmo.com/u/edsheeran`,venmoUsername:`edsheeran`,onVenmoPayment:s}},u={args:{handle:`billieeilish`,onStripePayment:o,venmoLink:`https://venmo.com/u/billieeilish`,venmoUsername:`billieeilish`,onVenmoPayment:s}},d={args:{handle:`theweeknd`,amounts:[5,10,25],onStripePayment:o}},f={args:{handle:`drake`,amounts:[10,25,50],onStripePayment:o}},p={args:{handle:`arianagrande`}},m={args:{handle:`postmalone`,amounts:[3,7,15],venmoLink:`https://venmo.com/u/postmalone`,venmoUsername:`postmalone`,onVenmoPayment:s}},h={render:()=>(0,i.jsx)(r,{handle:`dualipa`,amounts:[5,10,20],onStripePayment:async e=>{await new Promise(e=>setTimeout(e,3e3))}})},g={render:()=>(0,i.jsx)(r,{handle:`oliviarodrigo`,amounts:[3,5,10],onStripePayment:async e=>{alert(`Processing $${e} payment via Stripe...`),await new Promise(e=>setTimeout(e,1e3)),alert(`Payment successful! Thank you for the $${e} tip! 🎉`)},venmoLink:`https://venmo.com/u/oliviarodrigo`,venmoUsername:`oliviarodrigo`,onVenmoPayment:e=>{alert(`Would normally open: ${e}`)}})},_={args:{handle:`weeknd`,onStripePayment:o},parameters:{backgrounds:{default:`dark`}}},v=[`StripeOnly`,`VenmoOnly`,`BothPaymentMethods`,`CustomAmounts`,`LargeAmounts`,`QRFallback`,`VenmoWithCustomAmounts`,`LoadingDemo`,`InteractiveDemo`,`InDarkMode`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'taylorswift',
    onStripePayment: mockStripePayment
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'edsheeran',
    venmoLink: 'https://venmo.com/u/edsheeran',
    venmoUsername: 'edsheeran',
    onVenmoPayment: mockVenmoPayment
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'billieeilish',
    onStripePayment: mockStripePayment,
    venmoLink: 'https://venmo.com/u/billieeilish',
    venmoUsername: 'billieeilish',
    onVenmoPayment: mockVenmoPayment
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'theweeknd',
    amounts: [5, 10, 25],
    onStripePayment: mockStripePayment
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'drake',
    amounts: [10, 25, 50],
    onStripePayment: mockStripePayment
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'arianagrande'
    // No payment methods provided
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'postmalone',
    amounts: [3, 7, 15],
    venmoLink: 'https://venmo.com/u/postmalone',
    venmoUsername: 'postmalone',
    onVenmoPayment: mockVenmoPayment
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => {
    const handlePayment = async (amount: number) => {
      console.log(\`Processing $\${amount}...\`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log(\`Payment complete: $\${amount}\`);
    };
    return <PaySection handle='dualipa' amounts={[5, 10, 20]} onStripePayment={handlePayment} />;
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: () => {
    const handleStripePayment = async (amount: number) => {
      alert(\`Processing $\${amount} payment via Stripe...\`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert(\`Payment successful! Thank you for the $\${amount} tip! 🎉\`);
    };
    const handleVenmoPayment = (url: string) => {
      alert(\`Would normally open: \${url}\`);
    };
    return <PaySection handle='oliviarodrigo' amounts={[3, 5, 10]} onStripePayment={handleStripePayment} venmoLink='https://venmo.com/u/oliviarodrigo' venmoUsername='oliviarodrigo' onVenmoPayment={handleVenmoPayment} />;
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    handle: 'weeknd',
    onStripePayment: mockStripePayment
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,..._.parameters?.docs?.source}}}})))()}y();export{u as BothPaymentMethods,d as CustomAmounts,_ as InDarkMode,g as InteractiveDemo,f as LargeAmounts,h as LoadingDemo,p as QRFallback,c as StripeOnly,l as VenmoOnly,m as VenmoWithCustomAmounts,v as __namedExportsOrder,a as default};
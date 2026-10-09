import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{s as t,t as n}from"./routes-NOD5Mahi.js";import{n as r,t as i}from"./ProfilePaySurface-Dw5EPU75.js";var a,o,s,c,l,u;function d(){return(d=e((()=>{t(),r(),a={paymentState:`not_setup`,provider:`none`,manageHref:n.SETTINGS_PAYMENTS,tipUrl:null,tipVisits:0,tipsReceived:0,totalReceivedCents:0,monthReceivedCents:0,narrative:`Set up payments to start collecting tips from fans.`},o={title:`Dashboard/Molecules/ProfilePaySurface`,component:i,parameters:{layout:`padded`},args:{summary:a,onSetUsername:()=>{},onSetUpTips:()=>{},onManagePayments:()=>{},onViewAnalytics:()=>{}}},s={},c={args:{summary:{...a,paymentState:`active`,provider:`stripe`,tipUrl:`https://jov.ie/tim/pay`,tipVisits:214,tipsReceived:18,totalReceivedCents:42500,monthReceivedCents:8200,narrative:`You've received 18 tips totaling $425.00.`}}},l={args:{variant:`drawer`,summary:{...a,paymentState:`active`,provider:`venmo`,tipUrl:`https://jov.ie/tim/pay`,tipVisits:42,tipsReceived:3,totalReceivedCents:6e3,monthReceivedCents:2e3,narrative:`You've received 3 tips totaling $60.00.`}}},u=[`NotSetUp`,`Active`,`DrawerVariant`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    summary: {
      ...baseSummary,
      paymentState: 'active',
      provider: 'stripe',
      tipUrl: 'https://jov.ie/tim/pay',
      tipVisits: 214,
      tipsReceived: 18,
      totalReceivedCents: 42_500,
      monthReceivedCents: 8_200,
      narrative: "You've received 18 tips totaling $425.00."
    }
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'drawer',
    summary: {
      ...baseSummary,
      paymentState: 'active',
      provider: 'venmo',
      tipUrl: 'https://jov.ie/tim/pay',
      tipVisits: 42,
      tipsReceived: 3,
      totalReceivedCents: 6_000,
      monthReceivedCents: 2_000,
      narrative: "You've received 3 tips totaling $60.00."
    }
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as Active,l as DrawerVariant,s as NotSetUp,u as __namedExportsOrder,o as default};
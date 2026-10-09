import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{H as n,U as r}from"./removable-_8fTgXVw.js";import{c as i,s as a}from"./iframe-B1b4EUuv.js";import{n as o,t as s}from"./keys-CNuKOgyu.js";import{i as c,n as l,r as u,t as d}from"./BillingHistorySection-y2CImDPL.js";function f(){let e=c();return(0,m.jsx)(d,{historyQuery:e})}function p(e){return function({children:t}){let r=new a({defaultOptions:{queries:{retry:!1}}});return r.setQueryData(o.billing.invoices(),e),(0,m.jsx)(n,{client:r,children:t})}}var m,h,g,_,v,y;function b(){return(b=e((()=>{m=t(),i(),r(),s(),u(),l(),h=[{eventType:`subscription_created`,timestamp:`2026-09-01T12:00:00.000Z`,amount:1200,currency:`usd`,status:`paid`,maskedIdentifier:`card_4242`},{eventType:`invoice_paid`,timestamp:`2026-08-01T12:00:00.000Z`,amount:1200,currency:`usd`,status:`paid`,maskedIdentifier:`card_4242`}],g={title:`Organisms/Billing/BillingHistorySection`,component:f,parameters:{layout:`padded`}},_={decorators:[e=>{let t=p({entries:h});return(0,m.jsx)(t,{children:(0,m.jsx)(e,{})})}]},v={decorators:[e=>{let t=p({entries:[]});return(0,m.jsx)(t,{children:(0,m.jsx)(e,{})})}]},y=[`WithEntries`,`Empty`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  decorators: [Story => {
    const Provider = withHistoryData({
      entries
    });
    return <Provider>
          <Story />
        </Provider>;
  }]
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  decorators: [Story => {
    const Provider = withHistoryData({
      entries: []
    });
    return <Provider>
          <Story />
        </Provider>;
  }]
}`,...v.parameters?.docs?.source}}}})))()}b();export{v as Empty,_ as WithEntries,y as __namedExportsOrder,g as default};
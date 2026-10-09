import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./HudObservationStatus-CKS4UJyE.js";var r,i,a,o,s;function c(){return(c=e((()=>{t(),r={title:`Features/Admin/HudObservationStatus`,component:n,parameters:{layout:`centered`},args:{message:`Shipping velocity refreshed from the last 24h of merged PRs.`}},i={args:{state:`fresh`,freshnessLabel:`Updated 2m ago`}},a={args:{state:`stale`,freshnessLabel:`Updated 4h ago`,onRetry:()=>{}}},o={args:{state:`unavailable`,message:`Could not reach the shipping-velocity data source.`,onRetry:()=>{}}},s=[`Fresh`,`Stale`,`Unavailable`],i.parameters={...i.parameters,docs:{...i.parameters?.docs,source:{originalSource:`{
  args: {
    state: 'fresh',
    freshnessLabel: 'Updated 2m ago'
  }
}`,...i.parameters?.docs?.source}}},a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    state: 'stale',
    freshnessLabel: 'Updated 4h ago',
    onRetry: () => {}
  }
}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    state: 'unavailable',
    message: 'Could not reach the shipping-velocity data source.',
    onRetry: () => {}
  }
}`,...o.parameters?.docs?.source}}}})))()}c();export{i as Fresh,a as Stale,o as Unavailable,s as __namedExportsOrder,r as default};
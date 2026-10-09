import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./button-BSHhPV4e.js";var a;function o(){return(o=e((()=>{a=`/api/visibility-audit/offer`})))()}async function s(){let e=await fetch(a,{cache:`no-store`});if(!e.ok)return null;let t=await e.json();return t.visible?t:null}function c({loadOffer:e=s}){let[t,n]=(0,u.useState)(null);return(0,u.useEffect)(()=>{let t=!1;return e().then(e=>{t||n(e)}).catch(()=>{t||n(null)}),()=>{t=!0}},[e]),t?(0,l.jsxs)(`aside`,{"aria-label":`Visibility Audit Offer`,className:`flex flex-col gap-3`,"data-testid":`visibility-audit-offer`,children:[(0,l.jsx)(`p`,{className:`text-sm text-secondary-token`,children:t.detail}),(0,l.jsx)(i,{variant:`secondary`,size:`lg`,asChild:!0,children:(0,l.jsx)(`a`,{href:t.href,children:t.label})})]}):null}var l,u;function d(){return(d=e((()=>{l=n(),r(),u=t(),o()})))()}var f,p,m,h;function g(){return(g=e((()=>{d(),f={title:`Marketing/VisibilityAuditOffer`,component:c,parameters:{layout:`padded`,docs:{description:{component:`Default-off visibility audit offer rendered inside the pricing plans section. Renders nothing until the API reports a visible offer.`}}}},p={args:{loadOffer:async()=>null}},m={args:{loadOffer:async()=>({visible:!0,href:`https://buy.stripe.com/test_a1b2c3`,priceUsd:199,label:`Digital Footprint & Visibility Audit — $199`,detail:`This $199 audit is credited toward the first month of Artist Visibility Pro ($199/mo).`})}},h=[`Hidden`,`Visible`],p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    loadOffer: async () => null
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    loadOffer: async () => ({
      visible: true,
      href: 'https://buy.stripe.com/test_a1b2c3',
      priceUsd: 199,
      label: 'Digital Footprint & Visibility Audit — $199',
      detail: 'This $199 audit is credited toward the first month of Artist Visibility Pro ($199/mo).'
    })
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{p as Hidden,m as Visible,h as __namedExportsOrder,f as default};
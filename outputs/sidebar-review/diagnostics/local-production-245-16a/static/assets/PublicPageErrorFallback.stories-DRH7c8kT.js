import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r,t as i}from"./capture-B6zVxw45.js";import{n as a,t as o}from"./recovery-contract-C3cRRZE0.js";import{n as s,t as c}from"./SystemBErrorFallback-BPXsH_8Y.js";function l({error:e,context:t,onRefresh:n=()=>globalThis.location.reload()}){return(0,d.useEffect)(()=>{i(e,t,{digest:e.digest})},[t,e]),(0,u.jsx)(c,{description:`Try refreshing the page.`,digest:e.digest,action:{type:`button`,label:o.retryLabel,onClick:n},role:`alert`,ariaLive:`assertive`})}var u,d;function f(){return(f=e((()=>{u=n(),d=t(),a(),r(),s()})))()}var p,m,h,g;function _(){return(_=e((()=>{p=n(),f(),m={title:`Providers/PublicPageErrorFallback`,component:l,parameters:{layout:`fullscreen`},decorators:[e=>(0,p.jsx)(`div`,{className:`flex min-h-screen`,children:(0,p.jsx)(e,{})})]},h={args:{error:Object.assign(Error(`The landing page failed to render.`),{digest:`public-page-timeout`}),context:`LandingPage`,onRefresh:()=>void 0}},g=[`Default`],h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    error: Object.assign(new Error('The landing page failed to render.'), {
      digest: 'public-page-timeout'
    }),
    context: 'LandingPage',
    onRefresh: () => undefined
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{h as Default,g as __namedExportsOrder,m as default};
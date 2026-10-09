import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{r as n,s as r}from"./navigation-lA0z5ElE.js";import{t as i}from"./jsx-runtime-BbDfbRii.js";import{i as a,t as o}from"./utils-AN1vFgqV.js";import{n as s,r as c}from"./plan-prices-BZ1xPhp0.js";import{i as l,n as u}from"./constants-WHdIyOd9.js";import{c as d,n as f,o as p,r as m}from"./plan-intent-rjYJl1tu.js";import{a as h,c as g,l as _,o as v,r as y}from"./offer-truth-qHKz5fxM.js";function b(e){return e===`free`||e===`pro`||e===`max`?e:e===`team`||e===`enterprise`?`pro`:null}function x(e,t){return e===`sign-in`?t===`pro`?`Continue to Pro`:t===`max`?`Continue to Max`:`Continue with a free profile`:t===`pro`?`Start your 14-day Pro trial`:t===`max`?`Continue to Max`:`Claim your free profile`}function S(e,t){return e===`free`?`$0`:_(e,t)?`${y(s.pro.monthly)}/mo`:h(e)}function C({mode:e,enabled:t=!1}){let n=r(),[i,a]=(0,T.useState)(null);if((0,T.useEffect)(()=>{if(!t){a(null);return}a(f())},[t,n]),!t)return null;let s=b(d(n.get(`plan`)))??b(i?.plan??null);if(!s)return null;let c=p(n)??i?.interval??`month`,l=e===`sign-in`&&s!==`free`?`Existing subscribers go to billing — not a new trial.`:v(s);return(0,w.jsxs)(`aside`,{"data-testid":`auth-offer-summary`,"data-offer-plan":s,"data-offer-interval":c,"data-offer-mode":e,className:o(u.card,`mb-4 px-4 py-3 text-center`),children:[(0,w.jsx)(`p`,{className:`text-lg font-medium leading-tight tracking-tight text-primary-token`,children:x(e,s)}),(0,w.jsx)(`p`,{className:`mt-1 text-app leading-5 text-secondary-token`,children:S(s,c)}),(0,w.jsx)(`p`,{className:`mt-2 text-xs leading-5 text-tertiary-token`,children:l})]})}var w,T;function E(){return(E=e((()=>{w=i(),n(),T=t(),l(),m(),g(),c(),a()})))()}var D,O,k,A;function j(){return(j=e((()=>{E(),D={title:`Auth/AuthOfferSummary`,component:C,args:{enabled:!0},parameters:{layout:`padded`,nextjs:{appDirectory:!0,navigation:{pathname:`/signup`,query:{plan:`pro`,interval:`month`}}}}},O={args:{mode:`sign-up`,enabled:!0}},k={args:{mode:`sign-in`,enabled:!0},parameters:{nextjs:{appDirectory:!0,navigation:{pathname:`/signin`,query:{plan:`pro`,interval:`month`}}}}},A=[`SignUpProTrial`,`SignInContinue`],O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'sign-up',
    enabled: true
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'sign-in',
    enabled: true
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/signin',
        query: {
          plan: 'pro',
          interval: 'month'
        }
      }
    }
  }
}`,...k.parameters?.docs?.source}}}})))()}j();export{k as SignInContinue,O as SignUpProTrial,A as __namedExportsOrder,D as default};
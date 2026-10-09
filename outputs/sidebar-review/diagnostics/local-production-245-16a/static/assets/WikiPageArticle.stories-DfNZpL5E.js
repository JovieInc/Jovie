import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{$ as r,C as i,I as a,L as o,S as s,et as c}from"./lib-BQJd0cUN.js";import{i as l,n as u,r as d,t as f}from"./lib-BziAFY3J.js";import{n as p,t as m}from"./LegalMarkdownReader-FUQhX-mz.js";async function h(e){let t=l().use(i).use(u,{sanitize:!1}),n=t.parse(e),r=[];return o(n,`heading`,e=>{let t=e;if(!t.depth||t.depth>3)return;let n=c(e).trim();n&&r.push({id:g(n),title:n,level:t.depth})}),{html:String(await t.process(e)),toc:r}}var g;function _(){return(_=e((()=>{r(),d(),s(),f(),a(),g=e=>e.slice(0,200).toLowerCase().trim().replaceAll(/[^a-z0-9]+/g,`-`).replace(/^-+/,``).replace(/-+$/,``)})))()}async function v({page:e}){let t=e.compiled_truth?await h(e.compiled_truth):null;return(0,y.jsx)(`article`,{children:t?(0,y.jsx)(m,{html:t.html}):(0,y.jsx)(`p`,{className:`text-secondary-token`,children:`This wiki page has no content.`})})}var y;function b(){return(b=e((()=>{y=n(),p(),_()})))()}function x({page:e}){let t=(0,C.useMemo)(()=>v({page:e}),[e]);return(0,C.use)(t)}var S,C,w,T,E,D;function O(){return(O=e((()=>{S=n(),C=t(),b(),w={title:`Features/Admin/WikiPageArticle`,component:x,parameters:{layout:`padded`},args:{page:{slug:`ops/runbook`,title:`Runbook`,compiled_truth:`# Runbook

Restart the lane worker, then verify the queue drains.

## Verify

Check the lane gate is green.`}},decorators:[e=>(0,S.jsx)(`div`,{className:`max-w-160`,children:(0,S.jsx)(C.Suspense,{fallback:(0,S.jsx)(`p`,{className:`text-secondary-token`,children:`Loading article…`}),children:(0,S.jsx)(e,{})})})]},T={},E={args:{page:{slug:`ops/empty`,title:`Empty`}}},D=[`WithContent`,`Empty`],T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    page: {
      slug: 'ops/empty',
      title: 'Empty'
    }
  }
}`,...E.parameters?.docs?.source}}}})))()}O();export{E as Empty,T as WithContent,D as __namedExportsOrder,w as default};
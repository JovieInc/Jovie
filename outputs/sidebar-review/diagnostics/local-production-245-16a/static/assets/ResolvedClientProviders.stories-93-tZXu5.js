import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{r}from"./dev-test-auth-server-mock-CsTwuIa4.js";import{n as i,t as a}from"./ClientProviders-B8hpatdO.js";async function o({children:e,forceSignedOutDefaults:t=!1,initialThemeMode:n,skipCoreProviders:i}){let o=await r();return(0,s.jsx)(a,{authBootstrap:o,forceSignedOutDefaults:t,initialThemeMode:n,skipCoreProviders:i,children:e})}var s;function c(){return(c=e((()=>{s=n(),i()})))()}function l({children:e,forceSignedOutDefaults:t=!1}){let n=String(t),r=f.get(n);return r||(r=o({children:e,forceSignedOutDefaults:t}),f.set(n,r)),(0,d.use)(r)}var u,d,f,p,m,h,g;function _(){return(_=e((()=>{u=n(),d=t(),c(),f=new Map,p={title:`Providers/ResolvedClientProviders`,component:l,parameters:{layout:`fullscreen`}},m={args:{children:(0,u.jsx)(`p`,{children:`Resolved app shell`})}},h={args:{forceSignedOutDefaults:!0,children:(0,u.jsx)(`p`,{children:`Resolved public shell`})}},g=[`Default`,`SignedOutDefaults`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    children: <p>Resolved app shell</p>
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    forceSignedOutDefaults: true,
    children: <p>Resolved public shell</p>
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{m as Default,h as SignedOutDefaults,g as __namedExportsOrder,p as default};
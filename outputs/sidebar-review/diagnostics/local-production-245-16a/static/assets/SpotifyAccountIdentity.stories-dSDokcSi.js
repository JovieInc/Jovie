import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{h as n,p as r}from"./iframe-B1b4EUuv.js";import{n as i,t as a}from"./PlatformPill-uVZd5vJ9.js";function o({displayName:e,handle:t,accountId:n}){let r=e?.trim();if(r)return r;let i=t?.trim().replace(/^@/,``);return i?`@${i}`:n?.trim()||`Spotify account`}function s({displayName:e,handle:t,accountId:n,href:r,className:i}){let s=o({displayName:e,handle:t,accountId:n});return(0,c.jsx)(a,{platformIcon:`spotify`,platformName:`Spotify`,primaryText:s,onClick:r?()=>globalThis.open(r,`_blank`,`noopener,noreferrer`):void 0,className:i,testId:`spotify-account-identity`})}var c;function l(){return(l=e((()=>{c=t(),i()})))()}var u,d,f,p,m,h;function g(){return(g=e((()=>{u=t(),n(),l(),d={title:`Features/Admin/SpotifyAccountIdentity`,component:s,parameters:{layout:`centered`},decorators:[e=>(0,u.jsx)(r,{children:(0,u.jsx)(e,{})})]},f={args:{displayName:`Ari Lane`,href:`https://open.spotify.com/artist/ari`}},p={args:{handle:`@ari`,href:`https://open.spotify.com/artist/ari`}},m={args:{accountId:`spotify-artist-123`}},h=[`DisplayName`,`HandleOnly`,`AccountIdFallback`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    displayName: 'Ari Lane',
    href: 'https://open.spotify.com/artist/ari'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    handle: '@ari',
    href: 'https://open.spotify.com/artist/ari'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    accountId: 'spotify-artist-123'
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{m as AccountIdFallback,f as DisplayName,p as HandleOnly,h as __namedExportsOrder,d as default};
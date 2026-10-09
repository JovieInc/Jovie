import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./ActionDial-Dr04mraS.js";function a(e){let[t,n]=(0,s.useState)(e.selectedId);return(0,o.jsx)(`div`,{className:`w-80 rounded-3xl bg-surface-2 p-4`,children:(0,o.jsx)(i,{...e,selectedId:t,onSelect:t=>{n(t),e.onSelect(t)}})})}var o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{o=n(),s=t(),r(),{fn:c}=__STORYBOOK_MODULE_TEST__,l=[{id:`spotify`,label:`Spotify`,href:`https://open.spotify.com`},{id:`apple_music`,label:`Apple Music`,href:`https://music.apple.com`},{id:`deezer`,label:`Deezer`,href:`https://www.deezer.com`}],u={title:`Release/ActionDial`,component:i,parameters:{layout:`centered`,backgrounds:{default:`dark`}},args:{options:l,selectedId:`spotify`,onSelect:c(),onActivate:c(),actionLabel:`Stream Now`,groupLabel:`Choose a streaming service`,hint:`Swipe to switch. Your choice is remembered.`},render:e=>(0,o.jsx)(a,{...e})},d={},f={args:{selectedId:`apple_music`}},p={args:{options:l.slice(0,1)}},m={args:{disabled:!0}},h=[`SpotifySelected`,`AppleSelected`,`OneService`,`DisabledAction`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    selectedId: 'apple_music'
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    options: services.slice(0, 1)
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true
  }
}`,...m.parameters?.docs?.source}}}})))()}g();export{f as AppleSelected,m as DisabledAction,p as OneService,d as SpotifySelected,h as __namedExportsOrder,u as default};
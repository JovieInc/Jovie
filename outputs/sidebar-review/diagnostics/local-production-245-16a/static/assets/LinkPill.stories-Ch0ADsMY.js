import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./LinkPill-BBvio0wV.js";function a(e){let[t,n]=(0,s.useState)(!1);return(0,o.jsx)(i,{...e,isMenuOpen:t,onMenuOpenChange:n})}var o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{o=n(),s=t(),r(),c=[{id:`edit`,label:`Edit link`,iconName:`Pencil`,onSelect:()=>{}},{id:`copy`,label:`Copy link`,iconName:`Copy`,onSelect:()=>{}},{id:`remove`,label:`Remove`,iconName:`Trash2`,variant:`destructive`,onSelect:()=>{}}],l={title:`Dashboard/Atoms/LinkPill`,component:i,parameters:{layout:`centered`},args:{platformIcon:`spotify`,platformName:`Spotify`,primaryText:`Spotify`,secondaryText:`artist.spotify.com/12345`,state:`connected`,menuItems:c,menuId:`link-pill-story`},render:e=>(0,o.jsx)(a,{...e})},u={args:{platformIcon:`spotify`,platformName:`Spotify`,primaryText:`Spotify`,secondaryText:`artist.spotify.com/12345`,state:`connected`,menuItems:c,menuId:`link-pill-story`}},d={args:{platformIcon:`spotify`,platformName:`Spotify`,primaryText:`Spotify`,state:`error`,secondaryText:`Link is broken`,menuItems:c,menuId:`link-pill-story`}},f={args:{platformIcon:`spotify`,platformName:`Spotify`,primaryText:`Spotify`,secondaryText:`artist.spotify.com/12345`,state:`connected`,menuItems:[],menuId:`link-pill-story`}},p=[`Connected`,`ErrorState`,`NoMenuItems`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    secondaryText: 'artist.spotify.com/12345',
    state: 'connected',
    menuItems: MENU_ITEMS,
    menuId: 'link-pill-story'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    state: 'error',
    secondaryText: 'Link is broken',
    menuItems: MENU_ITEMS,
    menuId: 'link-pill-story'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    secondaryText: 'artist.spotify.com/12345',
    state: 'connected',
    menuItems: [],
    menuId: 'link-pill-story'
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{u as Connected,d as ErrorState,f as NoMenuItems,p as __namedExportsOrder,l as default};
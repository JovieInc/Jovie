import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./circle-check-CjH05h9T.js";import{n as a,t as o}from"./ellipsis-DPV-Uvav.js";import{n as s,t as c}from"./plus-BkSJRkAg.js";import{n as l,t as u}from"./refresh-cw-Do5j6SQ6.js";import{n as d,t as f}from"./unlink-BUFFd7aH.js";import{d as p,f as m,n as h,r as g,s as _,t as v}from"./dropdown-menu-Y42T2GdN.js";import{i as y,t as b}from"./utils-AN1vFgqV.js";import{i as x,n as S,r as C,t as w}from"./DspProviderIcon-7OrlHn_W.js";function T({provider:e,connected:t,artistName:n,onClick:r,onSyncNow:a,onDisconnect:s,disabled:l,className:d}){let m=S[e],y=C[e],[x,T]=(0,D.useState)(!1),[A,j]=(0,D.useState)(!1);return t&&!(a||s)?(0,E.jsxs)(`span`,{className:b(O,`text-secondary-token`,d),style:{borderColor:`${m}30`,backgroundColor:`${m}10`},children:[(0,E.jsx)(w,{provider:e,size:`sm`,className:`gap-0`}),(0,E.jsx)(`span`,{className:`truncate max-w-30 text-secondary-token`,children:n||`Connected`}),(0,E.jsx)(i,{className:`h-4 w-4 shrink-0`,style:{color:m}})]}):t?(0,E.jsxs)(v,{open:A,onOpenChange:j,children:[(0,E.jsx)(p,{asChild:!0,children:(0,E.jsxs)(`button`,{type:`button`,disabled:l,onMouseEnter:()=>T(!0),onMouseLeave:()=>T(!1),className:b(O,k,`cursor-pointer text-secondary-token`,d),style:{borderColor:`${m}30`,backgroundColor:`${m}10`},"aria-label":`${y} connection: ${n||`Connected`}`,children:[(0,E.jsx)(w,{provider:e,size:`sm`,className:`gap-0`}),(0,E.jsx)(`span`,{className:`truncate max-w-30 text-secondary-token`,children:n||`Connected`}),x||A?(0,E.jsx)(o,{className:`h-4 w-4 shrink-0`,style:{color:m}}):(0,E.jsx)(i,{className:`h-4 w-4 shrink-0`,style:{color:m}})]})}),(0,E.jsxs)(h,{align:`start`,sideOffset:4,children:[a&&(0,E.jsxs)(g,{onClick:a,children:[(0,E.jsx)(u,{className:`h-3.5 w-3.5`}),`Sync`]}),a&&s&&(0,E.jsx)(_,{}),s&&(0,E.jsxs)(g,{variant:`destructive`,onClick:s,children:[(0,E.jsx)(f,{className:`h-4 w-4`}),`Disconnect`]})]})]}):(0,E.jsxs)(`button`,{type:`button`,onClick:r,disabled:l,className:b(O,k,`border-subtle bg-surface-0 text-secondary-token hover:border-default hover:bg-surface-1 hover:text-primary-token`,d),"aria-label":`Connect ${y}`,children:[(0,E.jsx)(w,{provider:e,size:`sm`,className:`gap-0`}),(0,E.jsx)(`span`,{children:`Not Connected`}),(0,E.jsx)(c,{className:`h-4 w-4 shrink-0`})]})}var E,D,O,k;function A(){return(A=e((()=>{E=n(),m(),r(),a(),s(),l(),d(),D=t(),y(),x(),O=`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-caption tracking-tight transition-[background-color,border-color,color] duration-subtle`,k=`focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50 disabled:cursor-not-allowed`})))()}var j,M,N,P,F,I;function L(){return(L=e((()=>{A(),j={title:`Dashboard/Atoms/DspConnectionPill`,component:T,parameters:{layout:`centered`},args:{provider:`spotify`,connected:!1}},M={args:{onClick:()=>{}}},N={args:{connected:!0,artistName:`Sasha Waves`}},P={args:{connected:!0,artistName:`Sasha Waves`,onSyncNow:()=>{},onDisconnect:()=>{}}},F={args:{disabled:!0,onClick:()=>{}}},I=[`NotConnected`,`ConnectedNoActions`,`ConnectedWithMenu`,`Disabled`],M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  args: {
    onClick: () => {}
  }
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    connected: true,
    artistName: 'Sasha Waves'
  }
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  args: {
    connected: true,
    artistName: 'Sasha Waves',
    onSyncNow: () => {},
    onDisconnect: () => {}
  }
}`,...P.parameters?.docs?.source}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true,
    onClick: () => {}
  }
}`,...F.parameters?.docs?.source}}}})))()}L();export{N as ConnectedNoActions,P as ConnectedWithMenu,F as Disabled,M as NotConnected,I as __namedExportsOrder,j as default};
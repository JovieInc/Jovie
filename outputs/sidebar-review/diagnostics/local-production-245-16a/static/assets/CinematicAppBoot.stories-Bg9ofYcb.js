import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./useReducedMotion-Cwl4L1iT.js";import{i as a}from"./tokens-gwxcSXdR.js";import{n as o,t as s}from"./jovie-icon-path-CVaH2zdF.js";import{n as c,t as l}from"./JovieMarkElectric-Bmlrzig4.js";import{n as u,t as d}from"./AppShellSkeleton-DS9G5woP.js";function f({main:e,audioPlayer:t,brandVariant:n=`jovie`,hasSidebar:i=!0}){let[o,c]=(0,h.useState)(!1),[u,f]=(0,h.useState)(!1),v=r(),b=(0,h.useId)().replace(/[^a-zA-Z0-9_-]/g,``);(0,h.useEffect)(()=>{if(c(!0),n!==`ov`)try{globalThis.window!==void 0&&globalThis.window.sessionStorage&&(globalThis.window.sessionStorage.getItem(y)||(f(!0),globalThis.window.sessionStorage.setItem(y,`1`)))}catch{}},[n]);let x=i===!1?null:void 0;if(n===`ov`||!o||v||!u)return(0,m.jsx)(d,{main:e,audioPlayer:t,brandVariant:n,sidebar:x});let S=`jvf-logo-${b}`,C=`jvf-frame-${b}`,w=`jvf-frame-nosb-${b}`,T=`jvf-sidebar-${b}`,E=`jvf-content-${b}`,D=i?C:w;return(0,m.jsxs)(`div`,{role:`status`,"aria-live":`polite`,"aria-busy":`true`,"aria-label":`Loading Jovie`,"data-testid":`cinematic-app-boot`,style:{position:`absolute`,inset:0,background:`var(--linear-bg-page, #08090a)`,overflow:`hidden`},children:[(0,m.jsx)(`style`,{children:`
        @keyframes ${S} {
          0%   { opacity: 0;    transform: rotate(0deg); }
          6%   { opacity: 0;    transform: rotate(0deg); }
          22%  { opacity: 0.55; transform: rotate(0deg); }
          26%  { opacity: 0.55; transform: rotate(0deg); }
          48%  { opacity: 0.55; transform: rotate(-720deg); }
          50%  { opacity: 0.55; transform: rotate(-742deg); }
          52%  { opacity: 0.55; transform: rotate(-714deg); }
          54%  { opacity: 0.55; transform: rotate(-720deg); }
          62%  { opacity: 0;    transform: rotate(-720deg); }
          100% { opacity: 0;    transform: rotate(-720deg); }
        }
        @keyframes ${C} {
          0%, 56%  { opacity: 0; left: 12px; }
          66%      { opacity: 1; left: 12px; }
          70%      { opacity: 1; left: 12px; }
          78%      { opacity: 1; left: 252px; }
          100%     { opacity: 1; left: 252px; }
        }
        @keyframes ${w} {
          0%, 56%  { opacity: 0; left: 12px; }
          66%      { opacity: 1; left: 12px; }
          100%     { opacity: 1; left: 12px; }
        }
        @keyframes ${T} {
          0%, 70% { opacity: 0; transform: translateX(-14px); }
          84%     { opacity: 1; transform: translateX(0); }
          100%    { opacity: 1; transform: translateX(0); }
        }
        @keyframes ${E} {
          0%, 82% { opacity: 0; transform: translateY(10px); }
          100%    { opacity: 1; transform: translateY(0); }
        }
      `}),i&&(0,m.jsx)(`div`,{style:{position:`absolute`,left:0,top:0,bottom:0,width:244,animationName:T,animationDuration:`${_}ms`,animationTimingFunction:`var(--ds-motion-subtle-easing)`,animationFillMode:`forwards`,willChange:`opacity, transform`},children:(0,m.jsx)(p,{})}),(0,m.jsxs)(`div`,{style:{position:`absolute`,top:12,right:12,bottom:12,left:12,background:`var(--app-shell-content-surface, #0F1011)`,border:`1px solid rgba(255, 255, 255, 0.045)`,borderRadius:14,boxShadow:`0 0 0 1px rgba(0,0,0,0.25), inset 0 0 18px rgba(0,0,0,0.25), 0 24px 60px rgba(0,0,0,0.45)`,overflow:`hidden`,animationName:D,animationDuration:`${_}ms`,animationTimingFunction:`var(--ds-motion-subtle-easing)`,animationFillMode:`forwards`,willChange:`opacity`},children:[(0,m.jsx)(`div`,{"aria-hidden":`true`,style:{position:`absolute`,inset:0,display:`grid`,placeItems:`center`,pointerEvents:`none`},children:(0,m.jsx)(`div`,{style:{WebkitMaskImage:`radial-gradient(circle, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0) 95%)`,maskImage:`radial-gradient(circle, rgba(0,0,0,1) 55%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0) 95%)`},children:(0,m.jsx)(l,{size:620})})}),(0,m.jsxs)(`div`,{style:{position:`absolute`,inset:0,display:`flex`,flexDirection:`column`,alignItems:`center`,justifyContent:`center`,gap:30,paddingBottom:80,animationName:E,animationDuration:`${_}ms`,animationTimingFunction:`var(--ds-motion-cinematic-easing)`,animationFillMode:`forwards`,willChange:`opacity, transform`},children:[(0,m.jsx)(`div`,{style:{fontSize:40,fontWeight:600,color:`var(--linear-text-primary, #f7f8f8)`,letterSpacing:`-0.022em`},children:`Welcome to Jovie`}),(0,m.jsxs)(`div`,{style:{width:580,padding:`16px 22px`,background:`rgba(20, 20, 22, 0.65)`,border:`1px solid rgba(255, 255, 255, 0.07)`,borderRadius:9999,fontSize:14,color:`var(--linear-text-quaternary, #62666d)`,backdropFilter:`blur(8px)`,display:`flex`,alignItems:`center`,justifyContent:`space-between`,gap:14,boxShadow:`0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px rgba(0,0,0,0.35)`},children:[(0,m.jsx)(`span`,{children:`Ask Jovie…`}),(0,m.jsx)(`div`,{style:{width:30,height:30,borderRadius:9999,background:`rgba(255,255,255,0.08)`}})]})]})]}),(0,m.jsx)(`div`,{"aria-hidden":`true`,style:{position:`absolute`,inset:0,display:`grid`,placeItems:`center`,animationName:S,animationDuration:`${_}ms`,animationTimingFunction:`var(--ds-motion-subtle-easing)`,animationFillMode:`forwards`,pointerEvents:`none`,zIndex:5,willChange:`opacity, transform`},children:(0,m.jsx)(`svg`,{width:28,height:28*g,viewBox:s,style:{display:`block`,color:`rgba(247, 248, 248, 0.92)`},"aria-hidden":`true`,children:(0,m.jsx)(`path`,{fill:`currentColor`,d:a})})})]})}function p(){return(0,m.jsxs)(`div`,{"aria-hidden":`true`,style:{position:`absolute`,inset:0,background:`var(--app-shell-sidebar-background, #0c0d0f)`,borderRight:`1px solid var(--linear-border-subtle, rgba(255,255,255,0.055))`,display:`flex`,flexDirection:`column`,gap:6,padding:`10px 10px`},children:[(0,m.jsx)(`div`,{style:{height:24,width:96,borderRadius:4,background:`rgba(255,255,255,0.04)`,marginBottom:4}}),v.map(e=>(0,m.jsx)(`div`,{style:{height:26,borderRadius:4,background:`rgba(255,255,255,0.03)`,width:`${e}%`}},`sb-row-${e}`))]})}var m,h,g,_,v,y;function b(){return(b=e((()=>{m=n(),h=t(),c(),o(),u(),i(),g=347.97/353.68,_=2400,v=[68,78,86,64,80,90],y=`jovie:cinematic-boot-played`})))()}var x,S,C;function w(){return(w=e((()=>{b(),x={title:`Organisms/CinematicAppBoot`,component:f,parameters:{layout:`centered`}},S={},C=[`Default`],S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{}`,...S.parameters?.docs?.source}}}})))()}w();export{S as Default,C as __namedExportsOrder,x as default};
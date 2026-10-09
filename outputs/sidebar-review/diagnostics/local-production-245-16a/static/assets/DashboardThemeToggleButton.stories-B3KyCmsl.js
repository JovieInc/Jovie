import{n as e,s as t}from"./rolldown-runtime-BcKkbAw3.js";import{t as n}from"./react-CFeKwT_a.js";import{t as r}from"./jsx-runtime-BbDfbRii.js";import{n as i,t as a}from"./moon-D8-TFRzP.js";import{n as o,t as s}from"./sun-BX0Zf8Ga.js";import{a as c,i as l}from"./DashboardHeaderActionButton-BKogRlbO.js";function u({theme:e,onThemeChange:t}){let n=e===`dark`,r=n?`light`:`dark`;return(0,d.jsx)(l,{ariaLabel:`Switch to ${r} mode`,pressed:n,onClick:()=>{t?.(r)},icon:n?(0,d.jsx)(a,{className:`h-4 w-4`,"aria-hidden":`true`}):(0,d.jsx)(s,{className:`h-4 w-4`,"aria-hidden":`true`})})}var d;function f(){return(f=e((()=>{d=r(),i(),o(),c()})))()}function p(e){let[t,n]=h.useState(e.theme??`light`);return(0,m.jsx)(u,{...e,theme:t,onThemeChange:t=>{n(t),e.onThemeChange?.(t)}})}var m,h,g,_,v,y,b;function x(){return(x=e((()=>{m=r(),h=t(n()),f(),g={title:`Dashboard/Molecules/DashboardThemeToggleButton`,component:u,parameters:{layout:`padded`},args:{theme:`light`},argTypes:{theme:{control:{type:`select`},options:[`light`,`dark`]},onThemeChange:{action:`theme-change`}}},_={render:e=>(0,m.jsx)(p,{...e})},v={args:{theme:`light`}},y={args:{theme:`dark`}},b=[`Controlled`,`Light`,`Dark`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  render: args => <ControlledStory {...args} />
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    theme: 'light'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    theme: 'dark'
  }
}`,...y.parameters?.docs?.source}}}})))()}x();export{_ as Controlled,y as Dark,v as Light,b as __namedExportsOrder,g as default};
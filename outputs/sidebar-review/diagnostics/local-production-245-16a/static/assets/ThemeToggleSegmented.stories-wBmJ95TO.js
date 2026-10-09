import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./ThemeToggleSegmented-DdWi23Ru.js";function a({variant:e=`default`}){let[t,n]=(0,s.useState)(`system`),r=l.indexOf(t)*u;return(0,o.jsx)(i,{currentTheme:t,indicatorX:r,setTheme:e=>n(e),shortcutDescriptionId:`storybook-theme-shortcut`,shortcutDescription:`Press T to toggle between light and dark themes.`,variant:e,wrapButton:e=>e})}var o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{o=n(),s=t(),r(),c={title:`Site/ThemeToggle/ThemeToggleSegmented`,component:i,parameters:{layout:`centered`,docs:{description:{component:`Three-way theme selector with a tokenized indicator, semantic labels, and a stable 28px control geometry.`}}},tags:[`autodocs`]},l=[`system`,`light`,`dark`],u=28,d={args:{currentTheme:`system`,indicatorX:0,setTheme:()=>{},wrapButton:e=>e},render:()=>(0,o.jsx)(a,{})},f={args:{currentTheme:`system`,indicatorX:0,setTheme:()=>{},wrapButton:e=>e},render:()=>(0,o.jsx)(a,{variant:`linear`})},p=[`Controlled`,`Linear`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    currentTheme: 'system',
    indicatorX: 0,
    setTheme: () => {},
    wrapButton: button => button
  },
  render: () => <ControlledSegmented />
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    currentTheme: 'system',
    indicatorX: 0,
    setTheme: () => {},
    wrapButton: button => button
  },
  render: () => <ControlledSegmented variant='linear' />
}`,...f.parameters?.docs?.source}}}})))()}m();export{d as Controlled,f as Linear,p as __namedExportsOrder,c as default};
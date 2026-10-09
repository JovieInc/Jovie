import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";import{n as i,t as a}from"./MarketingContainer-B_bVfqAt.js";function o({className:e,children:t,eyebrow:n,reverse:i}){return(0,s.jsx)(`section`,{className:r(`section-spacing-linear`,e),children:(0,s.jsxs)(a,{width:`landing`,children:[n&&(0,s.jsx)(`div`,{className:r(`mb-8 lg:mb-10`,i&&`md:text-right`),children:(0,s.jsx)(`span`,{className:`homepage-section-eyebrow`,children:n})}),(0,s.jsx)(`div`,{className:r(`homepage-section-intro`,i&&`md:flex md:flex-row-reverse`),children:t})]})})}var s;function c(){return(c=e((()=>{s=t(),n(),i()})))()}function l(){return(0,u.jsxs)(`div`,{children:[(0,u.jsx)(`h2`,{className:`marketing-h2-linear text-primary-token`,children:`Your release work, connected.`}),(0,u.jsx)(`p`,{className:`mt-4 max-w-[34rem] text-mid leading-[1.65] text-secondary-token`,children:`Keep the next drop, the next fan, and the next action in one shared view instead of scattering them across tools.`})]})}var u,d,f,p,m,h;function g(){return(g=e((()=>{u=t(),c(),d={title:`Marketing/Primitives/MarketingSectionFrame`,component:o,parameters:{layout:`fullscreen`},decorators:[e=>(0,u.jsx)(`div`,{className:`bg-base text-primary-token`,children:(0,u.jsx)(e,{})})]},f={args:{children:null},render:()=>(0,u.jsx)(o,{children:(0,u.jsx)(l,{})})},p={args:{eyebrow:`Inside Jovie`,children:null},render:e=>(0,u.jsx)(o,{eyebrow:e.eyebrow,children:(0,u.jsx)(l,{})})},m={args:{eyebrow:`The platform`,reverse:!0,children:null},render:e=>(0,u.jsxs)(o,{eyebrow:e.eyebrow,reverse:e.reverse,children:[(0,u.jsx)(l,{}),(0,u.jsx)(`div`,{className:`rounded-2xl border border-subtle bg-surface-1 p-8 text-sm text-secondary-token`,children:`Section frames can reverse the landing grid so copy and media trade sides without a new layout primitive.`})]})},h=[`Default`,`WithEyebrow`,`Reversed`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    children: null
  },
  render: () => <MarketingSectionFrame>
      <FrameCopy />
    </MarketingSectionFrame>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    eyebrow: 'Inside Jovie',
    children: null
  },
  render: args => <MarketingSectionFrame eyebrow={args.eyebrow}>
      <FrameCopy />
    </MarketingSectionFrame>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    eyebrow: 'The platform',
    reverse: true,
    children: null
  },
  render: args => <MarketingSectionFrame eyebrow={args.eyebrow} reverse={args.reverse}>
      <FrameCopy />
      <div className='rounded-2xl border border-subtle bg-surface-1 p-8 text-sm text-secondary-token'>
        Section frames can reverse the landing grid so copy and media trade
        sides without a new layout primitive.
      </div>
    </MarketingSectionFrame>
}`,...m.parameters?.docs?.source}}}})))()}g();export{f as Default,m as Reversed,p as WithEyebrow,h as __namedExportsOrder,d as default};
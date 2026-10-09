import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./MarketingContainer-B_bVfqAt.js";function i({title:e,body:t}){return(0,a.jsxs)(`div`,{className:`rounded-2xl border border-subtle bg-surface-1 p-8`,children:[(0,a.jsx)(`h2`,{className:`text-xl font-semibold text-primary-token`,children:e}),(0,a.jsx)(`p`,{className:`mt-3 text-sm leading-relaxed text-secondary-token`,children:t})]})}var a,o,s,c,l,u;function d(){return(d=e((()=>{a=t(),n(),o={title:`Marketing/Primitives/MarketingContainer`,component:r,parameters:{layout:`fullscreen`},decorators:[e=>(0,a.jsx)(`div`,{className:`bg-base py-16 text-primary-token`,children:(0,a.jsx)(e,{})})]},s={args:{width:`page`,children:null},render:e=>(0,a.jsx)(r,{width:e.width,children:(0,a.jsx)(i,{title:`Canonical page width`,body:`Public marketing routes share this max-w-public-content column so sections line up from homepage through pricing and feature pages.`})})},c={args:{width:`landing`,children:null},render:e=>(0,a.jsx)(r,{width:e.width,children:(0,a.jsx)(i,{title:`Landing width alias`,body:`Landing stays as a call-site alias of the same public-content token until the remaining Wave 4 width sweep lands.`})})},l={args:{width:`prose`,children:null},render:e=>(0,a.jsx)(r,{width:e.width,children:(0,a.jsx)(i,{title:`Canonical prose width`,body:`Long-form about, support, and legal-style reading uses the 680px prose token instead of the public page column.`})})},u=[`Page`,`Landing`,`Prose`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    width: 'page',
    children: null
  },
  render: args => <MarketingContainer width={args.width}>
      <ContainerDemo title='Canonical page width' body='Public marketing routes share this max-w-public-content column so sections line up from homepage through pricing and feature pages.' />
    </MarketingContainer>
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    width: 'landing',
    children: null
  },
  render: args => <MarketingContainer width={args.width}>
      <ContainerDemo title='Landing width alias' body='Landing stays as a call-site alias of the same public-content token until the remaining Wave 4 width sweep lands.' />
    </MarketingContainer>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    width: 'prose',
    children: null
  },
  render: args => <MarketingContainer width={args.width}>
      <ContainerDemo title='Canonical prose width' body='Long-form about, support, and legal-style reading uses the 680px prose token instead of the public page column.' />
    </MarketingContainer>
}`,...l.parameters?.docs?.source}}}})))()}d();export{c as Landing,s as Page,l as Prose,u as __namedExportsOrder,o as default};
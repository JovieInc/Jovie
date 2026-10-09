import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./arrow-down-BZ3k7_e2.js";import{n as i,t as a}from"./copy-Ak4aYcMX.js";import{n as o,t as s}from"./sparkles-D0KQCtGE.js";import{n as c,t as l}from"./image-CenGJ5UI.js";import{n as u,t as d}from"./ThreadCardIconBtn-6d07lDGc.js";function f(e){let{prompt:t,status:n}=e;return(0,p.jsxs)(`div`,{className:`system-b-thread-media-card`,children:[(0,p.jsx)(`div`,{className:`system-b-thread-media-preview system-b-thread-image-preview`,children:n===`generating`?(0,p.jsxs)(`div`,{className:`system-b-thread-media-generating`,children:[(0,p.jsx)(`div`,{"aria-hidden":`true`,className:`system-b-thread-image-shimmer`}),(0,p.jsxs)(`p`,{className:`system-b-thread-generating-copy`,children:[`Generating “`,t,`”`]})]}):(0,p.jsx)(c,{src:e.previewUrl,alt:t,fill:!0,sizes:`(min-width: 768px) 768px, 100vw`,className:`object-cover`,unoptimized:!0})}),(0,p.jsxs)(`div`,{className:`system-b-thread-media-footer`,children:[(0,p.jsx)(s,{className:`system-b-thread-media-icon`,strokeWidth:2.25}),(0,p.jsx)(`span`,{className:`system-b-thread-media-label`,children:t}),n===`ready`&&(e.onDownload||e.onCopy||e.onRegenerate)&&(0,p.jsxs)(`span`,{className:`inline-flex items-center gap-0.5`,children:[e.onDownload&&(0,p.jsx)(d,{label:`Download`,onClick:e.onDownload,children:(0,p.jsx)(r,{className:`h-3 w-3`,strokeWidth:2.25})}),e.onCopy&&(0,p.jsx)(d,{label:`Copy`,onClick:e.onCopy,children:(0,p.jsx)(a,{className:`h-3 w-3`,strokeWidth:2.25})}),e.onRegenerate&&(0,p.jsx)(d,{label:`Regenerate`,onClick:e.onRegenerate,children:(0,p.jsx)(s,{className:`h-3 w-3`,strokeWidth:2.25})})]})]})]})}var p;function m(){return(m=e((()=>{p=t(),n(),i(),o(),l(),u()})))()}var h,g,_,v,y;function b(){return(b=e((()=>{m(),h={title:`Shell/ThreadImageCard`,component:f,parameters:{layout:`centered`}},g={args:{status:`generating`,prompt:`A neon-lit tour poster for a synthwave album`}},_={args:{status:`ready`,prompt:`A neon-lit tour poster for a synthwave album`,previewUrl:`https://placehold.co/768x432/111827/f5f5f5?text=Preview`,onDownload:()=>{},onCopy:()=>{},onRegenerate:()=>{}}},v={args:{status:`ready`,prompt:`A neon-lit tour poster for a synthwave album`,previewUrl:`https://placehold.co/768x432/111827/f5f5f5?text=Preview`}},y=[`Generating`,`Ready`,`ReadyWithoutActions`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'generating',
    prompt: 'A neon-lit tour poster for a synthwave album'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'ready',
    prompt: 'A neon-lit tour poster for a synthwave album',
    previewUrl: 'https://placehold.co/768x432/111827/f5f5f5?text=Preview',
    onDownload: () => {},
    onCopy: () => {},
    onRegenerate: () => {}
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'ready',
    prompt: 'A neon-lit tour poster for a synthwave album',
    previewUrl: 'https://placehold.co/768x432/111827/f5f5f5?text=Preview'
  }
}`,...v.parameters?.docs?.source}}}})))()}b();export{g as Generating,_ as Ready,v as ReadyWithoutActions,y as __namedExportsOrder,h as default};
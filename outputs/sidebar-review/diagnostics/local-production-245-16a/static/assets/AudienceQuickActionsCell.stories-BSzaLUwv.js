import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./createLucideIcon-DKtuYzxz.js";import{n as i,t as a}from"./download-Cu9d8wEM.js";import{i as o,t as s}from"./utils-AN1vFgqV.js";var c,l;function u(){return(u=e((()=>{n(),c={name:`shield-ban`,size:24,node:[[`path`,{d:`M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z`,key:`oel41y`}],[`path`,{d:`m4.243 5.21 14.39 12.472`,key:`1c9a7c`}]]},c.node,l=r(c)})))()}function d({onExport:e,onBlock:t,className:n}){return(0,f.jsxs)(`div`,{role:`toolbar`,className:s(`flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100`,n),onClick:e=>e.stopPropagation(),onKeyDown:e=>e.stopPropagation(),children:[(0,f.jsx)(`button`,{type:`button`,onClick:e,className:`inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-secondary-token focus-visible:outline-none focus-visible:bg-interactive-hover`,"aria-label":`Export contact`,title:`Export vCard`,children:(0,f.jsx)(a,{className:`h-4 w-4`})}),(0,f.jsx)(`button`,{type:`button`,onClick:t,className:`inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:bg-interactive-hover`,"aria-label":`Block member`,title:`Block`,children:(0,f.jsx)(l,{className:`h-4 w-4`})})]})}var f;function p(){return(p=e((()=>{f=t(),i(),u(),o()})))()}var m,h,g,_,v,y,b,x;function S(){return(S=e((()=>{m=t(),p(),{expect:h,fn:g,userEvent:_,within:v}=__STORYBOOK_MODULE_TEST__,y={title:`Organisms/Table/Atoms/AudienceQuickActionsCell`,component:d,parameters:{layout:`centered`},decorators:[e=>(0,m.jsx)(`div`,{className:`group w-32 bg-surface-0 p-2`,children:(0,m.jsx)(e,{})})],args:{onExport:g(),onBlock:g()}},b={play:async({canvasElement:e,args:t})=>{let n=v(e);await _.click(n.getByRole(`button`,{name:`Export contact`})),await h(t.onExport).toHaveBeenCalled(),await _.click(n.getByRole(`button`,{name:`Block member`})),await h(t.onBlock).toHaveBeenCalled()}},x=[`Default`],b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', {
      name: 'Export contact'
    }));
    await expect(args.onExport).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('button', {
      name: 'Block member'
    }));
    await expect(args.onBlock).toHaveBeenCalled();
  }
}`,...b.parameters?.docs?.source}}}})))()}S();export{b as Default,x as __namedExportsOrder,y as default};
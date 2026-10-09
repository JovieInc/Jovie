import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{a as r,n as i,r as a}from"./icon-button-contract-Cl-QiCER.js";import{n as o,t as s}from"./icon-button-ChwKjABM.js";import{n as c,r as l}from"./next-themes-mock-BTTZ5A_l.js";function u({children:e,theme:t}){let{theme:n,setTheme:r}=l(),i=(0,m.useRef)(n);return(0,m.useEffect)(()=>(r(t),()=>{r(i.current??`dark`)}),[r,t]),e}function d({theme:e}){return(0,p.jsx)(`section`,{children:(0,p.jsxs)(`div`,{className:`rounded-xl bg-surface-0 p-5 text-primary-token`,children:[(0,p.jsx)(`p`,{className:`mb-4 text-xs font-medium text-secondary-token`,children:e===`dark`?`Dark Surface`:`Light Surface`}),(0,p.jsx)(`div`,{className:`flex items-start gap-6`,children:y.map(({label:t,props:n})=>(0,p.jsxs)(`div`,{className:`flex flex-col items-center gap-2`,children:[(0,p.jsx)(s,{...n,ariaLabel:`${e===`dark`?`Dark`:`Light`} ${t}`,size:`md`,variant:`secondary`,children:(0,p.jsx)(v,{})}),(0,p.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:t})]},t))})]})})}async function f(e,t){let n=e.ownerDocument.documentElement;await _(()=>h(n).toHaveClass(t));let r=e.querySelector(`button[data-state="idle"]`);if(await h(r).toBeInTheDocument(),!r)return;await h(r).toHaveClass(`bg-transparent`),await h(r).toHaveClass(`rounded-full`);let i=getComputedStyle(r);await h(i.borderRadius).not.toBe(`0px`);let a=!1;r.addEventListener(`pointerover`,()=>{a=!0},{once:!0}),await g.hover(r),await h(a).toBe(!0),await h(r).toHaveClass(`hover:bg-interactive-hover`),await g.unhover(r),await g.tab(),await h(r).toHaveFocus(),await h(r.matches(`:focus-visible`)).toBe(!0),await h(r).toHaveClass(`focus-visible:bg-interactive-hover`);let o=!1;r.addEventListener(`pointerdown`,()=>{o=!0},{once:!0}),await g.pointer({keys:`[MouseLeft>]`,target:r}),await h(o).toBe(!0),await h(r).toHaveClass(`active:bg-interactive-active`),await g.pointer({keys:`[/MouseLeft]`});let s=e.querySelector(`button[data-state="disabled"]`),c=e.querySelector(`button[data-state="loading"]`);await h(s).toBeDisabled(),await h(c).toHaveAttribute(`aria-busy`,`true`);for(let e of[r,s,c]){if(!e)continue;let t=e.getBoundingClientRect(),n=getComputedStyle(e,`::before`);await h([t.width,t.height]).toEqual([32,32]),await h([n.width,n.height]).toEqual([`44px`,`44px`])}}var p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O,k,A,j,M,N,P,F,I;function L(){return(L=e((()=>{p=n(),c(),m=t(),o(),r(),{expect:h,userEvent:g,waitFor:_}=__STORYBOOK_MODULE_TEST__,v=()=>(0,p.jsx)(`svg`,{"aria-hidden":`true`,viewBox:`0 0 16 16`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,className:`h-4 w-4`,children:(0,p.jsx)(`circle`,{cx:`8`,cy:`8`,r:`6`})}),y=[{label:`Rest`,props:{}},{label:`Disabled`,props:{disabled:!0}},{label:`Loading`,props:{loading:!0}},{label:`Destructive`,props:{destructive:!0}}],b={title:`shadcn/IconButton`,component:s,parameters:{layout:`centered`,docs:{description:{component:`Canonical icon-only button (JOV-4871): one size/variant contract for every icon button, built on the base Button so the focus ring, 44px hit target, and reduced-motion behavior are identical everywhere.`}}},tags:[`autodocs`],argTypes:{variant:{control:{type:`select`},options:[...a],description:`Visual style variant`},size:{control:{type:`select`},options:[...i],description:`Container size: xs 24 / sm 28 / md 32 / lg 40 / xl 44px`},disabled:{control:{type:`boolean`},description:`Disabled state`},loading:{control:{type:`boolean`},description:`Loading state with stable control geometry`},asChild:{control:{type:`boolean`},description:`Render as child element (Radix Slot)`}}},x={args:{ariaLabel:`Ghost action`,variant:`ghost`,size:`lg`,children:(0,p.jsx)(v,{})}},S={args:{ariaLabel:`Surface action`,variant:`surface`,size:`lg`,children:(0,p.jsx)(v,{})}},C={args:{ariaLabel:`Frosted action`,variant:`frosted`,size:`lg`,children:(0,p.jsx)(v,{})}},w={args:{ariaLabel:`Secondary action`,variant:`secondary`,size:`lg`,children:(0,p.jsx)(v,{})}},T={decorators:[e=>(0,p.jsx)(u,{theme:`light`,children:(0,p.jsx)(e,{})})],render:()=>(0,p.jsx)(d,{theme:`light`}),play:async({canvasElement:e})=>{await f(e,`light`)},parameters:{backgrounds:{default:`light`},docs:{description:{story:`Desktop light-surface proof. Rest is transparent; hover and keyboard focus reveal the circular interactive surface, pointer press uses the circular active surface, and disabled/loading keep the same control box and 44px interaction target.`}}}},E={decorators:[e=>(0,p.jsx)(u,{theme:`dark`,children:(0,p.jsx)(e,{})})],render:()=>(0,p.jsx)(d,{theme:`dark`}),play:async({canvasElement:e})=>{await f(e,`dark`)},parameters:{backgrounds:{default:`dark`},docs:{description:{story:`Desktop dark-surface proof using root-scoped dark tokens.`}}}},D={decorators:[e=>(0,p.jsx)(u,{theme:`light`,children:(0,p.jsx)(e,{})})],render:()=>(0,p.jsx)(d,{theme:`light`}),play:async({canvasElement:e})=>{await f(e,`light`)},parameters:{backgrounds:{default:`light`},viewport:{defaultViewport:`mobile1`}}},O={decorators:[e=>(0,p.jsx)(u,{theme:`dark`,children:(0,p.jsx)(e,{})})],render:()=>(0,p.jsx)(d,{theme:`dark`}),play:async({canvasElement:e})=>{await f(e,`dark`)},parameters:{backgrounds:{default:`dark`},viewport:{defaultViewport:`mobile1`}}},k={args:{ariaLabel:`Outline action`,variant:`outline`,size:`lg`,children:(0,p.jsx)(v,{})}},A={args:{ariaLabel:`Pearl action`,variant:`pearl`,size:`lg`,children:(0,p.jsx)(v,{})}},j={args:{ariaLabel:`Quiet pearl action`,variant:`pearlQuiet`,size:`lg`,children:(0,p.jsx)(v,{})}},M={args:{ariaLabel:`Control action`,variant:`control`,size:`sm`,children:(0,p.jsx)(v,{})}},N={args:{ariaLabel:`Inline action`,variant:`inline`,size:`lg`,children:(0,p.jsx)(v,{})}},P={render:()=>(0,p.jsx)(`div`,{className:`flex items-center gap-3`,children:i.map(e=>(0,p.jsx)(s,{ariaLabel:`${e} action`,size:e,children:(0,p.jsx)(v,{})},e))})},F={render:()=>(0,p.jsx)(`div`,{className:`grid grid-cols-3 gap-5 rounded-xl bg-surface-0 p-6`,children:a.map(e=>(0,p.jsxs)(`div`,{className:`flex flex-col items-center gap-2`,children:[(0,p.jsx)(s,{ariaLabel:`${e} action`,size:`md`,variant:e,children:(0,p.jsx)(v,{})}),(0,p.jsx)(`span`,{className:`text-xs text-tertiary-token`,children:e})]},e))})},I=[`Ghost`,`Surface`,`Frosted`,`Secondary`,`SecondaryStateMatrix`,`SecondaryStateMatrixDark`,`SecondaryStateMatrixMobile`,`SecondaryStateMatrixDarkMobile`,`Outline`,`Pearl`,`PearlQuiet`,`Control`,`Inline`,`AllSizes`,`AllVariants`],x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Ghost action',
    variant: 'ghost',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Surface action',
    variant: 'surface',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Frosted action',
    variant: 'frosted',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Secondary action',
    variant: 'secondary',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <RootProofTheme theme='light'>
        <Story />
      </RootProofTheme>],
  render: () => <SecondaryStateSurface theme='light' />,
  play: async ({
    canvasElement
  }) => {
    await verifySecondaryStateStory(canvasElement, 'light');
  },
  parameters: {
    backgrounds: {
      default: 'light'
    },
    docs: {
      description: {
        story: 'Desktop light-surface proof. Rest is transparent; hover and keyboard focus reveal the circular interactive surface, pointer press uses the circular active surface, and disabled/loading keep the same control box and 44px interaction target.'
      }
    }
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <RootProofTheme theme='dark'>
        <Story />
      </RootProofTheme>],
  render: () => <SecondaryStateSurface theme='dark' />,
  play: async ({
    canvasElement
  }) => {
    await verifySecondaryStateStory(canvasElement, 'dark');
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    docs: {
      description: {
        story: 'Desktop dark-surface proof using root-scoped dark tokens.'
      }
    }
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <RootProofTheme theme='light'>
        <Story />
      </RootProofTheme>],
  render: () => <SecondaryStateSurface theme='light' />,
  play: async ({
    canvasElement
  }) => {
    await verifySecondaryStateStory(canvasElement, 'light');
  },
  parameters: {
    backgrounds: {
      default: 'light'
    },
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <RootProofTheme theme='dark'>
        <Story />
      </RootProofTheme>],
  render: () => <SecondaryStateSurface theme='dark' />,
  play: async ({
    canvasElement
  }) => {
    await verifySecondaryStateStory(canvasElement, 'dark');
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    viewport: {
      defaultViewport: 'mobile1'
    }
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Outline action',
    variant: 'outline',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Pearl action',
    variant: 'pearl',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Quiet pearl action',
    variant: 'pearlQuiet',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...j.parameters?.docs?.source}}},M.parameters={...M.parameters,docs:{...M.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Control action',
    variant: 'control',
    size: 'sm',
    children: <PlaceholderIcon />
  }
}`,...M.parameters?.docs?.source}}},N.parameters={...N.parameters,docs:{...N.parameters?.docs,source:{originalSource:`{
  args: {
    ariaLabel: 'Inline action',
    variant: 'inline',
    size: 'lg',
    children: <PlaceholderIcon />
  }
}`,...N.parameters?.docs?.source}}},P.parameters={...P.parameters,docs:{...P.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center gap-3'>
      {ICON_BUTTON_SIZE_NAMES.map(size => <IconButton key={size} ariaLabel={\`\${size} action\`} size={size}>
          <PlaceholderIcon />
        </IconButton>)}
    </div>
}`,...P.parameters?.docs?.source}}},F.parameters={...F.parameters,docs:{...F.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid grid-cols-3 gap-5 rounded-xl bg-surface-0 p-6'>
      {ICON_BUTTON_VARIANT_NAMES.map(variant => <div className='flex flex-col items-center gap-2' key={variant}>
          <IconButton ariaLabel={\`\${variant} action\`} size='md' variant={variant}>
            <PlaceholderIcon />
          </IconButton>
          <span className='text-xs text-tertiary-token'>{variant}</span>
        </div>)}
    </div>
}`,...F.parameters?.docs?.source}}}})))()}L();export{P as AllSizes,F as AllVariants,M as Control,C as Frosted,x as Ghost,N as Inline,k as Outline,A as Pearl,j as PearlQuiet,w as Secondary,T as SecondaryStateMatrix,E as SecondaryStateMatrixDark,O as SecondaryStateMatrixDarkMobile,D as SecondaryStateMatrixMobile,S as Surface,I as __namedExportsOrder,b as default};
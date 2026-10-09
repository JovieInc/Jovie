import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./search-Binh2gA_.js";import{n as a,r as o}from"./next-themes-mock-BTTZ5A_l.js";import{n as s,t as c}from"./OnboardingToolField-C2umb9Ij.js";function l({children:e,theme:t}){let{theme:n,setTheme:r}=o(),i=(0,f.useRef)(n);return(0,f.useEffect)(()=>{let e=i.current;return r(t),()=>{r(e??`dark`)}},[r,t]),(0,d.jsx)(`div`,{className:`w-80 rounded-xl bg-surface-1 p-4 text-primary-token`,children:e})}function u({density:e,label:t,defaultValue:n,disabled:r=!1}){let a=`onboarding-tool-field-story-${t.replaceAll(/\s+/g,`-`).toLowerCase()}`;return(0,d.jsxs)(c,{density:e,htmlFor:a,children:[e===`picker`?(0,d.jsx)(i,{className:`h-3.5 w-3.5 shrink-0 text-tertiary-token`}):null,(0,d.jsx)(`span`,{className:`sr-only`,children:t}),(0,d.jsx)(`input`,{id:a,"aria-label":t,defaultValue:n,disabled:r,placeholder:t,className:`min-w-0 flex-1 bg-transparent text-sm leading-6 text-primary-token placeholder:text-quaternary-token focus:outline-none`})]})}var d,f,p,m,h,g,_,v,y,b,x,S,C,w,T;function E(){return(E=e((()=>{d=n(),r(),a(),f=t(),s(),{expect:p,userEvent:m,waitFor:h}=__STORYBOOK_MODULE_TEST__,g={title:`Onboarding/Tool Field`,component:u,parameters:{layout:`centered`},decorators:[(e,t)=>(0,d.jsx)(l,{theme:t.parameters.theme??`dark`,children:(0,d.jsx)(e,{})})]},_={args:{density:`compact`,label:`Edit Proposed Handle`,defaultValue:`validartist`}},v={args:{density:`picker`,label:`Search Spotify artists`,defaultValue:`Test Artist`}},y={args:{density:`compact`,label:`Social Profile URL`,defaultValue:`https://instagram.com/yourname`},play:async({canvasElement:e})=>{let t=e.querySelector(`input[aria-label="Social Profile URL"]`);if(await p(t).toBeInTheDocument(),!t)return;await m.tab(),await p(t).toHaveFocus(),await p(t.matches(`:focus-visible`)).toBe(!0);let n=t.closest(`[data-slot="onboarding-tool-field"]`);await p(n).toHaveClass(`focus-within:border-focus`),await p(n).toHaveClass(`focus-within:ring-focus/16`)}},b={args:{density:`compact`,label:`Edit Proposed Handle`,defaultValue:`validartist`,disabled:!0}},x={args:{density:`compact`,label:`Edit Proposed Handle`,defaultValue:`validartist`},parameters:{theme:`light`},play:async({canvasElement:e})=>{await h(()=>p(e.ownerDocument.documentElement).toHaveClass(`light`))}},S={args:{density:`picker`,label:`Search Spotify artists`,defaultValue:`Test Artist`},play:async({canvasElement:e})=>{await h(()=>p(e.ownerDocument.documentElement).toHaveClass(`dark`))}},C={args:{density:`compact`,label:`Social Profile URL`,defaultValue:`https://instagram.com/yourname`},play:async({canvasElement:e})=>{let t=e.querySelector(`[data-slot="onboarding-tool-field"]`);await p(t).toHaveClass(`motion-reduce:transition-none`),await p(t).toHaveClass(`duration-subtle`)}},w={render:()=>(0,d.jsxs)(`div`,{className:`grid w-80 gap-6`,children:[(0,d.jsxs)(`div`,{children:[(0,d.jsx)(`p`,{className:`mb-1 text-xs text-secondary-token`,children:`Picker`}),(0,d.jsx)(u,{density:`picker`,label:`Search Spotify artists`,defaultValue:`Test Artist`})]}),(0,d.jsxs)(`div`,{children:[(0,d.jsx)(`p`,{className:`mb-1 text-xs text-secondary-token`,children:`Compact`}),(0,d.jsx)(u,{density:`compact`,label:`Edit Proposed Handle`,defaultValue:`validartist`})]})]})},T=[`Idle`,`IdlePicker`,`Focused`,`Disabled`,`Light`,`Dark`,`ReducedMotion`,`Geometry`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact',
    label: 'Edit Proposed Handle',
    defaultValue: 'validartist'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'picker',
    label: 'Search Spotify artists',
    defaultValue: 'Test Artist'
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact',
    label: 'Social Profile URL',
    defaultValue: 'https://instagram.com/yourname'
  },
  play: async ({
    canvasElement
  }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[aria-label="Social Profile URL"]');
    await expect(input).toBeInTheDocument();
    if (!input) return;
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await expect(input.matches(':focus-visible')).toBe(true);
    const owner = input.closest('[data-slot="onboarding-tool-field"]');
    await expect(owner).toHaveClass('focus-within:border-focus');
    await expect(owner).toHaveClass('focus-within:ring-focus/16');
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact',
    label: 'Edit Proposed Handle',
    defaultValue: 'validartist',
    disabled: true
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact',
    label: 'Edit Proposed Handle',
    defaultValue: 'validartist'
  },
  parameters: {
    theme: 'light'
  },
  play: async ({
    canvasElement
  }) => {
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveClass('light'));
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'picker',
    label: 'Search Spotify artists',
    defaultValue: 'Test Artist'
  },
  play: async ({
    canvasElement
  }) => {
    await waitFor(() => expect(canvasElement.ownerDocument.documentElement).toHaveClass('dark'));
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    density: 'compact',
    label: 'Social Profile URL',
    defaultValue: 'https://instagram.com/yourname'
  },
  play: async ({
    canvasElement
  }) => {
    const owner = canvasElement.querySelector('[data-slot="onboarding-tool-field"]');
    await expect(owner).toHaveClass('motion-reduce:transition-none');
    await expect(owner).toHaveClass('duration-subtle');
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid w-80 gap-6'>
      <div>
        <p className='mb-1 text-xs text-secondary-token'>Picker</p>
        <FieldPreview density='picker' label='Search Spotify artists' defaultValue='Test Artist' />
      </div>
      <div>
        <p className='mb-1 text-xs text-secondary-token'>Compact</p>
        <FieldPreview density='compact' label='Edit Proposed Handle' defaultValue='validartist' />
      </div>
    </div>
}`,...w.parameters?.docs?.source}}}})))()}E();export{S as Dark,b as Disabled,y as Focused,w as Geometry,_ as Idle,v as IdlePicker,x as Light,C as ReducedMotion,T as __namedExportsOrder,g as default};
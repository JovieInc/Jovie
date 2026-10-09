import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./input-BYNkmjMu.js";var i,a,o,s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{i=t(),n(),a={title:`UI/Atoms/Input`,component:r,parameters:{layout:`centered`},tags:[`autodocs`]},o={args:{label:`Search`,placeholder:`Search tracks`,helpText:`Search by track, artist, or album.`,id:`input-default`}},s={args:{placeholder:`Disabled`,disabled:!0,id:`input-disabled`}},c={args:{placeholder:`Loading…`,loading:!0,id:`input-loading`}},l={args:{label:`Artist URL`,placeholder:`Invalid value`,validationState:`invalid`,error:`Enter a valid artist URL.`,defaultValue:`bad`,id:`input-error`}},u={args:{label:`Artist URL`,validationState:`valid`,defaultValue:`https://jov.ie/artist`,helpText:`This URL is available.`,id:`input-success`}},d={args:{label:`Artist URL`,validationState:`pending`,defaultValue:`https://jov.ie/artist`,helpText:`Checking availability…`,id:`input-pending`}},f={render:()=>(0,i.jsxs)(`div`,{className:`grid max-w-80 gap-4`,style:{width:`min(20rem, calc(100vw - 2rem))`},children:[(0,i.jsx)(r,{id:`input-matrix-default`,label:`Default`,placeholder:`Search tracks`,helpText:`Search by track, artist, or album.`}),(0,i.jsx)(r,{id:`input-matrix-error`,label:`Error`,validationState:`invalid`,defaultValue:`bad`,error:`Enter a valid artist URL.`}),(0,i.jsx)(r,{id:`input-matrix-success`,label:`Success`,validationState:`valid`,defaultValue:`https://jov.ie/artist`,helpText:`This URL is available.`}),(0,i.jsx)(r,{id:`input-matrix-disabled`,label:`Disabled`,disabled:!0,defaultValue:`Read only`}),(0,i.jsx)(r,{id:`input-matrix-loading`,label:`Loading`,loading:!0,defaultValue:`Checking...`}),(0,i.jsx)(r,{id:`input-matrix-pending`,label:`Pending`,validationState:`pending`,defaultValue:`https://jov.ie/artist`,helpText:`Checking availability...`}),(0,i.jsx)(r,{id:`input-matrix-long-placeholder`,label:`Long Placeholder`,placeholder:`Paste a long artist profile URL that should remain clipped inside the input without moving adjacent controls`})]})},p={args:{label:`Keyboard Focus`,placeholder:`Press Tab to focus`,id:`input-keyboard-focus`}},m={render:()=>(0,i.jsxs)(`div`,{className:`grid max-w-80 gap-4`,style:{width:`min(20rem, calc(100vw - 2rem))`},children:[(0,i.jsx)(r,{id:`input-small`,inputSize:`sm`,label:`Small`,placeholder:`Value`}),(0,i.jsx)(r,{id:`input-medium`,label:`Medium`,placeholder:`Value`}),(0,i.jsx)(r,{id:`input-large`,inputSize:`lg`,label:`Large`,placeholder:`Value`})]})},h={args:{defaultValue:`An extremely long value that should not overflow the narrow input container in visual tests`,id:`input-long`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-64`,children:(0,i.jsx)(e,{})})]},g={args:{label:`Artist URL`,placeholder:`Paste a long artist profile URL that should remain clipped inside the input without moving adjacent controls`,id:`input-long-placeholder`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-64`,children:(0,i.jsx)(e,{})})]},_=[`Default`,`Disabled`,`Loading`,`Error`,`Success`,`Pending`,`ConformanceMatrix`,`KeyboardFocus`,`Sizes`,`LongContent`,`LongPlaceholder`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Search',
    placeholder: 'Search tracks',
    helpText: 'Search by track, artist, or album.',
    id: 'input-default'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    placeholder: 'Disabled',
    disabled: true,
    id: 'input-disabled'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    placeholder: 'Loading…',
    loading: true,
    id: 'input-loading'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Artist URL',
    placeholder: 'Invalid value',
    validationState: 'invalid',
    error: 'Enter a valid artist URL.',
    defaultValue: 'bad',
    id: 'input-error'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Artist URL',
    validationState: 'valid',
    defaultValue: 'https://jov.ie/artist',
    helpText: 'This URL is available.',
    id: 'input-success'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Artist URL',
    validationState: 'pending',
    defaultValue: 'https://jov.ie/artist',
    helpText: 'Checking availability…',
    id: 'input-pending'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid max-w-80 gap-4' style={{
    width: 'min(20rem, calc(100vw - 2rem))'
  }}>
      <Input id='input-matrix-default' label='Default' placeholder='Search tracks' helpText='Search by track, artist, or album.' />
      <Input id='input-matrix-error' label='Error' validationState='invalid' defaultValue='bad' error='Enter a valid artist URL.' />
      <Input id='input-matrix-success' label='Success' validationState='valid' defaultValue='https://jov.ie/artist' helpText='This URL is available.' />
      <Input id='input-matrix-disabled' label='Disabled' disabled defaultValue='Read only' />
      <Input id='input-matrix-loading' label='Loading' loading defaultValue='Checking...' />
      <Input id='input-matrix-pending' label='Pending' validationState='pending' defaultValue='https://jov.ie/artist' helpText='Checking availability...' />
      <Input id='input-matrix-long-placeholder' label='Long Placeholder' placeholder='Paste a long artist profile URL that should remain clipped inside the input without moving adjacent controls' />
    </div>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Keyboard Focus',
    placeholder: 'Press Tab to focus',
    id: 'input-keyboard-focus'
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid max-w-80 gap-4' style={{
    width: 'min(20rem, calc(100vw - 2rem))'
  }}>
      <Input id='input-small' inputSize='sm' label='Small' placeholder='Value' />
      <Input id='input-medium' label='Medium' placeholder='Value' />
      <Input id='input-large' inputSize='lg' label='Large' placeholder='Value' />
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    defaultValue: 'An extremely long value that should not overflow the narrow input container in visual tests',
    id: 'input-long'
  },
  decorators: [Story => <div className='w-64'>
        <Story />
      </div>]
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Artist URL',
    placeholder: 'Paste a long artist profile URL that should remain clipped inside the input without moving adjacent controls',
    id: 'input-long-placeholder'
  },
  decorators: [Story => <div className='w-64'>
        <Story />
      </div>]
}`,...g.parameters?.docs?.source}}}})))()}v();export{f as ConformanceMatrix,o as Default,s as Disabled,l as Error,p as KeyboardFocus,c as Loading,h as LongContent,g as LongPlaceholder,d as Pending,m as Sizes,u as Success,_ as __namedExportsOrder,a as default};
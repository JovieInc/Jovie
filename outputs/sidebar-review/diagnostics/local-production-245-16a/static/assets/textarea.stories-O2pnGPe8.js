import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./textarea-D63TVxG8.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),a={title:`UI/Atoms/Textarea`,component:r,parameters:{layout:`centered`},tags:[`autodocs`]},o={args:{label:`Release notes`,placeholder:`Tell fans about your release…`,helpText:`Keep it concise and specific.`,id:`ta-default`}},s={args:{disabled:!0,defaultValue:`Read only`,id:`ta-disabled`}},c={args:{label:`Release notes`,validationState:`invalid`,defaultValue:`Too short`,helpText:`Describe what listeners should know.`,error:`Use at least 20 characters.`,id:`ta-error`}},l={args:{label:`Release notes`,validationState:`valid`,defaultValue:`A stripped-back version recorded live in Los Angeles.`,helpText:`Ready to publish.`,id:`ta-success`}},u={args:{label:`Release notes`,validationState:`pending`,defaultValue:`A stripped-back version recorded live in Los Angeles.`,helpText:`Checking copy…`,id:`ta-pending`}},d={render:()=>(0,i.jsxs)(`div`,{className:`grid w-80 gap-4`,children:[(0,i.jsx)(r,{id:`ta-small`,textareaSize:`sm`,label:`Small`}),(0,i.jsx)(r,{id:`ta-medium`,label:`Medium`}),(0,i.jsx)(r,{id:`ta-large`,textareaSize:`lg`,label:`Large`})]})},f={args:{id:`ta-long`,defaultValue:Array.from({length:8},(e,t)=>`Line ${t+1} of bio content.`).join(`
`)},decorators:[e=>(0,i.jsx)(`div`,{className:`w-64`,children:(0,i.jsx)(e,{})})]},p=[`Default`,`Disabled`,`Error`,`Success`,`Pending`,`Sizes`,`LongContent`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Release notes',
    placeholder: 'Tell fans about your release…',
    helpText: 'Keep it concise and specific.',
    id: 'ta-default'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    disabled: true,
    defaultValue: 'Read only',
    id: 'ta-disabled'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Release notes',
    validationState: 'invalid',
    defaultValue: 'Too short',
    helpText: 'Describe what listeners should know.',
    error: 'Use at least 20 characters.',
    id: 'ta-error'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Release notes',
    validationState: 'valid',
    defaultValue: 'A stripped-back version recorded live in Los Angeles.',
    helpText: 'Ready to publish.',
    id: 'ta-success'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    label: 'Release notes',
    validationState: 'pending',
    defaultValue: 'A stripped-back version recorded live in Los Angeles.',
    helpText: 'Checking copy…',
    id: 'ta-pending'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid w-80 gap-4'>
      <Textarea id='ta-small' textareaSize='sm' label='Small' />
      <Textarea id='ta-medium' label='Medium' />
      <Textarea id='ta-large' textareaSize='lg' label='Large' />
    </div>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    id: 'ta-long',
    defaultValue: Array.from({
      length: 8
    }, (_, i) => \`Line \${i + 1} of bio content.\`).join('\\n')
  },
  decorators: [Story => <div className='w-64'>
        <Story />
      </div>]
}`,...f.parameters?.docs?.source}}}})))()}m();export{o as Default,s as Disabled,c as Error,f as LongContent,u as Pending,d as Sizes,l as Success,p as __namedExportsOrder,a as default};
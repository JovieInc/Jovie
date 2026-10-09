import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./field-ZRu8i5Na.js";import{n as i,t as a}from"./input-BYNkmjMu.js";var o,s,c,l,u,d,f;function p(){return(p=e((()=>{o=t(),n(),i(),s={title:`UI/Atoms/Field`,component:r,parameters:{layout:`centered`},tags:[`autodocs`]},c={render:()=>(0,o.jsx)(r,{label:`Display name`,description:`Shown on your public profile`,id:`field-name`,children:(0,o.jsx)(a,{placeholder:`Artist name`})})},l={render:()=>(0,o.jsx)(r,{label:`Email`,error:`Enter a valid email address`,required:!0,id:`field-email`,children:(0,o.jsx)(a,{type:`email`,defaultValue:`not-an-email`})})},u={render:()=>(0,o.jsx)(`div`,{className:`w-64`,children:(0,o.jsx)(r,{label:`Bio with a particularly long label that wraps`,description:`Help text that also wraps in a narrow container for overflow checks.`,id:`field-bio`,children:(0,o.jsx)(a,{})})})},d={render:()=>(0,o.jsxs)(`div`,{className:`w-72`,children:[(0,o.jsx)(`p`,{id:`external-profile-help`,className:`mb-2 text-xs text-tertiary-token`,children:`This note belongs to the surrounding workflow.`}),(0,o.jsx)(r,{label:`Profile handle`,description:`You can change this later.`,id:`field-handle`,children:(0,o.jsx)(a,{"aria-describedby":`external-profile-help`,defaultValue:`jovie`})})]})},f=[`Default`,`Error`,`LongContent`,`PreservesControlDescription`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <Field label='Display name' description='Shown on your public profile' id='field-name'>
      <Input placeholder='Artist name' />
    </Field>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <Field label='Email' error='Enter a valid email address' required id='field-email'>
      <Input type='email' defaultValue='not-an-email' />
    </Field>
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-64'>
      <Field label='Bio with a particularly long label that wraps' description='Help text that also wraps in a narrow container for overflow checks.' id='field-bio'>
        <Input />
      </Field>
    </div>
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-72'>
      <p id='external-profile-help' className='mb-2 text-xs text-tertiary-token'>
        This note belongs to the surrounding workflow.
      </p>
      <Field label='Profile handle' description='You can change this later.' id='field-handle'>
        <Input aria-describedby='external-profile-help' defaultValue='jovie' />
      </Field>
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{c as Default,l as Error,u as LongContent,d as PreservesControlDescription,f as __namedExportsOrder,s as default};
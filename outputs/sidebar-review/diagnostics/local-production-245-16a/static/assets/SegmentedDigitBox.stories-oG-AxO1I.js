import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./SegmentedDigitBox-By971FOw.js";var a,o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{a=n(),o=t(),r(),{fn:s}=__STORYBOOK_MODULE_TEST__,c={title:`Atoms/SegmentedDigitBox`,component:i,parameters:{layout:`centered`,jovie:{uncoveredProps:[`e`]}},args:{digit:``,isFocused:!1,index:0,inputRef:s(),onInputChange:s(),onKeyDown:s(),onInput:s(),onFocus:s(),onBlur:s(),ariaLabel:`Digit 1 of 6`,boxSizeClassName:`h-12 w-11 sm:h-12 sm:w-12`,textSizeClassName:`text-lg sm:text-xl`}},l={},u={args:{isFocused:!0}},d={args:{digit:`4`}},f={args:{digit:`9`,error:!0}},p={args:{digit:`2`,disabled:!0}},m=[{slot:`otp-slot-1`,digit:`4`},{slot:`otp-slot-2`,digit:`2`},{slot:`otp-slot-3`,digit:``},{slot:`otp-slot-4`,digit:``},{slot:`otp-slot-5`,digit:``},{slot:`otp-slot-6`,digit:``}],h={name:`Sequence (fieldset)`,render:e=>(0,a.jsx)(`fieldset`,{className:`flex justify-center gap-2 border-0 p-0`,children:m.map(({slot:t,digit:n},r)=>(0,o.createElement)(i,{...e,key:t,digit:n,index:r,isFocused:r===2,ariaLabel:`Digit ${r+1} of 6`}))})},g=[`Empty`,`Focused`,`Filled`,`Error`,`Disabled`,`OtpSequence`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    isFocused: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    digit: '4'
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    digit: '9',
    error: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    digit: '2',
    disabled: true
  }
}`,...p.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  name: 'Sequence (fieldset)',
  render: args => <fieldset className='flex justify-center gap-2 border-0 p-0'>
      {OTP_SEQUENCE_SLOTS.map(({
      slot,
      digit
    }, index) => <SegmentedDigitBox {...args} key={slot} digit={digit} index={index} isFocused={index === 2} ariaLabel={\`Digit \${index + 1} of 6\`} />)}
    </fieldset>
}`,...h.parameters?.docs?.source}}}})))()}_();export{p as Disabled,l as Empty,f as Error,d as Filled,u as Focused,h as OtpSequence,g as __namedExportsOrder,c as default};
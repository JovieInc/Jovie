import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./FormStatus-CYqWahBF.js";var i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{i=t(),n(),a={title:`Molecules/FormStatus`,component:r,parameters:{layout:`centered`}},o={args:{loading:!0,className:`w-80`}},s={args:{error:`Something went wrong. Please try again.`,className:`w-80`}},c={args:{success:`Your changes have been saved successfully.`,className:`w-80`}},l={args:{loading:!0,error:`Previous attempt failed.`,className:`w-80`}},u={args:{className:`w-80`}},d={render:()=>(0,i.jsxs)(`div`,{className:`space-y-6 w-80`,children:[(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`p`,{className:`text-sm font-medium mb-2`,children:`Loading State:`}),(0,i.jsx)(r,{loading:!0})]}),(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`p`,{className:`text-sm font-medium mb-2`,children:`Error State:`}),(0,i.jsx)(r,{error:`Failed to save changes.`})]}),(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`p`,{className:`text-sm font-medium mb-2`,children:`Success State:`}),(0,i.jsx)(r,{success:`Profile updated successfully!`})]})]})},f=[`Loading`,`Error`,`Success`,`LoadingWithError`,`Empty`,`AllStates`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    loading: true,
    className: 'w-80'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    error: 'Something went wrong. Please try again.',
    className: 'w-80'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    success: 'Your changes have been saved successfully.',
    className: 'w-80'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    loading: true,
    error: 'Previous attempt failed.',
    className: 'w-80'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    // No loading, error, or success - should render nothing
    className: 'w-80'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='space-y-6 w-80'>
      <div>
        <p className='text-sm font-medium mb-2'>Loading State:</p>
        <FormStatus loading />
      </div>
      <div>
        <p className='text-sm font-medium mb-2'>Error State:</p>
        <FormStatus error='Failed to save changes.' />
      </div>
      <div>
        <p className='text-sm font-medium mb-2'>Success State:</p>
        <FormStatus success='Profile updated successfully!' />
      </div>
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as AllStates,u as Empty,s as Error,o as Loading,l as LoadingWithError,c as Success,f as __namedExportsOrder,a as default};
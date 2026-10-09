import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./InfoBox-DYmmq_zD.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),a={title:`Molecules/InfoBox`,component:r,parameters:{layout:`centered`},argTypes:{variant:{control:`select`,options:[`info`,`warning`,`success`,`error`]}}},o={args:{title:`Information`,variant:`info`,children:`This is an informational message to help guide the user.`,className:`w-96`}},s={args:{title:`Warning`,variant:`warning`,children:`Please review this information before proceeding.`,className:`w-96`}},c={args:{title:`Success`,variant:`success`,children:`Your changes have been saved successfully.`,className:`w-96`}},l={args:{title:`Error`,variant:`error`,children:`Something went wrong. Please try again.`,className:`w-96`}},u={args:{variant:`info`,children:`This info box has no title, just content.`,className:`w-96`}},d={render:()=>(0,i.jsxs)(`div`,{className:`space-y-4 w-96`,children:[(0,i.jsx)(r,{title:`Information`,variant:`info`,children:`This is an informational message.`}),(0,i.jsx)(r,{title:`Warning`,variant:`warning`,children:`Please review before proceeding.`}),(0,i.jsx)(r,{title:`Success`,variant:`success`,children:`Operation completed successfully.`}),(0,i.jsx)(r,{title:`Error`,variant:`error`,children:`An error occurred. Please try again.`})]})},f={render:()=>(0,i.jsxs)(`div`,{className:`w-96 space-y-4`,children:[(0,i.jsx)(r,{presentation:`inline`,variant:`success`,children:`Artist import complete.`}),(0,i.jsx)(r,{presentation:`inline`,variant:`warning`,children:`Artist import is taking longer than expected.`}),(0,i.jsx)(r,{presentation:`inline`,variant:`error`,children:`Artist import failed. Try again.`})]})},p=[`Info`,`Warning`,`Success`,`Error`,`WithoutTitle`,`AllVariants`,`InlineNotices`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Information',
    variant: 'info',
    children: 'This is an informational message to help guide the user.',
    className: 'w-96'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Warning',
    variant: 'warning',
    children: 'Please review this information before proceeding.',
    className: 'w-96'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Success',
    variant: 'success',
    children: 'Your changes have been saved successfully.',
    className: 'w-96'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    title: 'Error',
    variant: 'error',
    children: 'Something went wrong. Please try again.',
    className: 'w-96'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'info',
    children: 'This info box has no title, just content.',
    className: 'w-96'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: () => <div className='space-y-4 w-96'>
      <InfoBox title='Information' variant='info'>
        This is an informational message.
      </InfoBox>
      <InfoBox title='Warning' variant='warning'>
        Please review before proceeding.
      </InfoBox>
      <InfoBox title='Success' variant='success'>
        Operation completed successfully.
      </InfoBox>
      <InfoBox title='Error' variant='error'>
        An error occurred. Please try again.
      </InfoBox>
    </div>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <div className='w-96 space-y-4'>
      <InfoBox presentation='inline' variant='success'>
        Artist import complete.
      </InfoBox>
      <InfoBox presentation='inline' variant='warning'>
        Artist import is taking longer than expected.
      </InfoBox>
      <InfoBox presentation='inline' variant='error'>
        Artist import failed. Try again.
      </InfoBox>
    </div>
}`,...f.parameters?.docs?.source}}}})))()}m();export{d as AllVariants,l as Error,o as Info,f as InlineNotices,c as Success,s as Warning,u as WithoutTitle,p as __namedExportsOrder,a as default};
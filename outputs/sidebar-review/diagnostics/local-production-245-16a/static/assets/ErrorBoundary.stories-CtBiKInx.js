import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ErrorBoundary-Cuz3z4a4.js";function i(){return(0,o.jsx)(`p`,{className:`rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token`,children:`Content rendered without error.`})}function a(){throw Error(`Simulated render error for the story`)}var o,s,c,l,u,d;function f(){return(f=e((()=>{o=t(),n(),s={title:`Providers/ErrorBoundary`,component:r,parameters:{layout:`centered`}},c={args:{children:(0,o.jsx)(i,{})}},l={args:{children:(0,o.jsx)(a,{}),showToast:!1}},u={args:{children:(0,o.jsx)(a,{}),showToast:!1,fallback:(0,o.jsx)(`p`,{className:`rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token`,children:`Custom fallback content`})}},d=[`NoError`,`CaughtError`,`CustomFallback`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    children: <WorkingChild />
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    children: <ThrowingChild />,
    showToast: false
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    children: <ThrowingChild />,
    showToast: false,
    fallback: <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'>
        Custom fallback content
      </p>
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{l as CaughtError,u as CustomFallback,c as NoError,d as __namedExportsOrder,s as default};
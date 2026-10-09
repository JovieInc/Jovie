import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ReleaseSaveStatusRow-C3QmJ07M.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={title:`Organisms/ReleaseSidebar/ReleaseSaveStatusRow`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-64`,children:(0,i.jsx)(e,{})})],args:{status:`idle`}},s={},c={args:{status:`saving`}},l={args:{status:`saved`}},u={args:{status:`error`,feedback:{message:`Couldn't save changes.`,actionLabel:`Retry`,onRetry:a()}}},d=[`Idle`,`Saving`,`Saved`,`ErrorFeedback`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'saving'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'saved'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    status: 'error',
    feedback: {
      message: "Couldn't save changes.",
      actionLabel: 'Retry',
      onRetry: fn()
    }
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{u as ErrorFeedback,s as Idle,l as Saved,c as Saving,d as __namedExportsOrder,o as default};
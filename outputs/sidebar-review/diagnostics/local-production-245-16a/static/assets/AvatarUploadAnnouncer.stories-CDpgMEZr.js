import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./AvatarUploadAnnouncer-DqQ9z_GZ.js";var i,a,o,s,c,l,u;function d(){return(d=e((()=>{i=t(),n(),a={title:`Atoms/AvatarUploadAnnouncer`,component:r,parameters:{layout:`centered`,docs:{description:{component:"`AvatarUploadAnnouncer` renders visually-hidden `aria-live` regions only —\nthere is nothing to see. Each story exposes the live-region text via a\nvisible caption so the announcement content can be reviewed here."}}},args:{progress:0,status:`idle`},render:e=>(0,i.jsxs)(`div`,{className:`flex flex-col items-center gap-3 text-app text-secondary-token`,children:[(0,i.jsx)(`p`,{children:`Screen-reader-only announcement (sr-only region shown for review):`}),(0,i.jsxs)(`div`,{className:`rounded-md border border-subtle bg-surface-1 px-3 py-2 text-primary-token`,children:[(0,i.jsx)(r,{...e}),e.progress>0&&`Uploading profile photo: ${Math.round(e.progress)}% complete`,e.status===`success`&&`Profile photo uploaded successfully`,e.status===`error`&&`Profile photo upload failed`,e.progress===0&&e.status===`idle`&&`No announcement`]})]})},o={},s={args:{progress:42,status:`uploading`}},c={args:{progress:100,status:`success`}},l={args:{progress:0,status:`error`}},u=[`Idle`,`Uploading`,`Success`,`Error`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    progress: 42,
    status: 'uploading'
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    progress: 100,
    status: 'success'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    progress: 0,
    status: 'error'
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{l as Error,o as Idle,c as Success,s as Uploading,u as __namedExportsOrder,a as default};
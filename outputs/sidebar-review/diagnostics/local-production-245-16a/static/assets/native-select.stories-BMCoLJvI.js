import{n as e,s as t}from"./rolldown-runtime-BcKkbAw3.js";import{t as n}from"./react-CFeKwT_a.js";import{t as r}from"./jsx-runtime-BbDfbRii.js";import{n as i,t as a}from"./utils-CTJK0RKy.js";function o(...e){return e.filter(Boolean).join(` `)||void 0}var s,c,l;function u(){return(u=e((()=>{s=r(),c=t(n()),i(),l=c.forwardRef(({options:e,placeholder:t=`Select an option`,label:n,error:r,required:i=!1,className:l,id:u,"aria-describedby":d,"aria-invalid":f,...p},m)=>{let h=c.useId(),g=u??`native-select-${h}`,_=`${g}-error`,v=!!r||f!==void 0&&f!==!1&&f!==`false`,y=o(d,r?_:void 0),b=(0,s.jsxs)(`select`,{ref:m,id:g,"data-slot":`native-select`,"data-state":v?`invalid`:`default`,required:i,"aria-describedby":y,"aria-invalid":r?!0:f,className:a(`block h-9 w-full rounded-md border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 text-app font-normal text-(--linear-text-primary)`,`hover:border-(--linear-border-default)`,`focus-visible:border-(--linear-border-focus) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/24`,`disabled:cursor-not-allowed disabled:opacity-50`,v&&`border-(--linear-error) hover:border-(--linear-error) focus-visible:border-(--linear-error) focus-visible:ring-(--linear-error)/24`,l),...p,children:[(0,s.jsx)(`option`,{value:``,children:t}),e.map(e=>(0,s.jsx)(`option`,{value:e.value,disabled:e.disabled,children:e.label},e.value))]});return!n&&!r?b:(0,s.jsxs)(`div`,{"data-slot":`native-select-field`,className:`space-y-1.5`,children:[n?(0,s.jsxs)(`label`,{"data-slot":`native-select-label`,htmlFor:g,className:`text-sm font-medium text-secondary-token`,children:[n,i?(0,s.jsx)(`span`,{className:`ml-1 text-destructive`,"aria-hidden":`true`,children:`*`}):null]}):null,b,(0,s.jsx)(`div`,{"data-slot":`native-select-error-slot`,className:`min-h-5`,"aria-live":`polite`,children:r?(0,s.jsx)(`p`,{id:_,"data-slot":`native-select-error`,className:`text-sm text-destructive`,role:`alert`,children:r}):null})]})}),l.displayName=`NativeSelect`})))()}var d,f,p,m,h,g,_,v,y;function b(){return(b=e((()=>{d=r(),u(),f=[{value:`draft`,label:`Draft`},{value:`live`,label:`Live`},{value:`archived`,label:`Archived`,disabled:!0}],p={title:`UI/Atoms/NativeSelect`,component:l,parameters:{layout:`centered`},decorators:[e=>(0,d.jsx)(`div`,{className:`w-72`,children:(0,d.jsx)(e,{})})],tags:[`autodocs`]},m={args:{options:f,label:`Release status`,name:`status`}},h={args:{options:f,label:`Release status`,required:!0,name:`status`}},g={args:{options:f,label:`Release status`,defaultValue:`live`,name:`status`}},_={args:{options:f,label:`Release status`,error:`Choose a status`,name:`status`}},v={args:{options:f,label:`Release status`,disabled:!0,name:`status`}},y=[`Default`,`Required`,`Selected`,`Error`,`Disabled`],m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    options,
    label: 'Release status',
    name: 'status'
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    options,
    label: 'Release status',
    required: true,
    name: 'status'
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    options,
    label: 'Release status',
    defaultValue: 'live',
    name: 'status'
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    options,
    label: 'Release status',
    error: 'Choose a status',
    name: 'status'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    options,
    label: 'Release status',
    disabled: true,
    name: 'status'
  }
}`,...v.parameters?.docs?.source}}}})))()}b();export{m as Default,v as Disabled,_ as Error,h as Required,g as Selected,y as __namedExportsOrder,p as default};
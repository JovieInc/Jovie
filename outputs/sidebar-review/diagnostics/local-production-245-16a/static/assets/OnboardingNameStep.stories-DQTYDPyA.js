import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{i,t as a}from"./utils-AN1vFgqV.js";import{i as o,r as s,t as c}from"./constants-WHdIyOd9.js";function l({title:e,prompt:t,fullName:n,namePlaceholder:i,isValid:o,isTransitioning:l,isSubmitting:d,inputRef:f,onNameChange:p,onSubmit:m}){return(0,u.jsx)(`div`,{className:`flex flex-col items-center justify-center h-full`,children:(0,u.jsxs)(`div`,{className:`w-full max-w-md ${s.formContainer}`,children:[(0,u.jsxs)(`div`,{className:a(s.headerSection,`mb-6`),children:[(0,u.jsx)(`h1`,{className:s.title,children:e}),t&&(0,u.jsx)(`p`,{className:s.hint,children:t})]}),(0,u.jsxs)(`form`,{className:a(s.formInner,`space-y-2.5`),onSubmit:e=>{e.preventDefault(),o&&!l&&!d&&m()},children:[(0,u.jsx)(`input`,{id:`display-name`,ref:f,name:`name`,type:`text`,value:n,onChange:e=>p(e.target.value),placeholder:i,"aria-label":`Your Full Name`,maxLength:50,autoComplete:`name`,className:`w-full rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-(--app-shell-content-surface)`}),(0,u.jsx)(r,{type:`submit`,className:c.authCta,static:!0,disabled:!o||l||d,children:d?`Submitting…`:`Continue`})]})]})})}var u;function d(){return(d=e((()=>{u=t(),n(),o(),i()})))()}var f,p,m;function h(){return(h=e((()=>{d(),f={title:`Features/Dashboard/Organisms/Onboarding/OnboardingNameStep`,component:l,parameters:{layout:`centered`,jovie:{uncoveredProps:[`title`,`fullName`,`namePlaceholder`,`isValid`,`isTransitioning`,`isSubmitting`,`inputRef`,`onNameChange`,`onSubmit`]}}},p={args:{title:`What's your name?`,fullName:`Mock Artist`,namePlaceholder:`Your name`,isValid:!0,isTransitioning:!1,isSubmitting:!1,inputRef:{current:null},onNameChange:()=>{},onSubmit:()=>{}}},m=[`Default`],p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    title: "What's your name?",
    fullName: 'Mock Artist',
    namePlaceholder: 'Your name',
    isValid: true,
    isTransitioning: false,
    isSubmitting: false,
    inputRef: {
      current: null
    },
    onNameChange: () => {},
    onSubmit: () => {}
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{p as Default,m as __namedExportsOrder,f as default};
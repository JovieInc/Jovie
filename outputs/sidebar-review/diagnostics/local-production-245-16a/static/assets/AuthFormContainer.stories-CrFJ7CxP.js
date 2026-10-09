import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";import{n as i,t as a}from"./AuthLayout-Cy9tukJZ.js";function o({children:e,className:t}){return(0,s.jsx)(`div`,{className:r(`w-full`,t),children:e})}var s;function c(){return(c=e((()=>{s=t(),n()})))()}var l,u,d,f,p,m,h;function g(){return(g=e((()=>{l=t(),c(),i(),u={title:`Auth/AuthFormContainer`,component:o,parameters:{layout:`fullscreen`}},d=()=>(0,l.jsxs)(`div`,{className:`space-y-4`,children:[(0,l.jsxs)(`div`,{className:`space-y-2`,children:[(0,l.jsx)(`label`,{className:`text-sm font-medium text-primary-token`,children:`Email`}),(0,l.jsx)(`input`,{type:`email`,placeholder:`you@example.com`,className:`w-full px-3 py-2 border border-subtle rounded-xl bg-surface-0 text-primary-token placeholder:text-tertiary-token`})]}),(0,l.jsx)(`button`,{type:`button`,className:`w-full py-2 bg-btn-primary text-btn-primary-foreground rounded-xl font-medium`,children:`Continue`})]}),f={render:()=>(0,l.jsx)(a,{formTitle:`Sign in`,showFormTitle:!1,showFooterPrompt:!1,children:(0,l.jsx)(o,{children:(0,l.jsx)(d,{})})})},p={render:()=>(0,l.jsx)(a,{formTitle:`Create your account`,showFormTitle:!1,showFooterPrompt:!1,chrome:`splash-b`,children:(0,l.jsx)(o,{children:(0,l.jsx)(d,{})})})},m={render:()=>(0,l.jsx)(a,{formTitle:`Sign in`,showFormTitle:!1,showFooterPrompt:!1,layoutVariant:`split`,children:(0,l.jsx)(o,{children:(0,l.jsx)(d,{})})})},h=[`SignIn`,`SignUp`,`SplitShell`],f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  render: () => <AuthLayout formTitle='Sign in' showFormTitle={false} showFooterPrompt={false}>
      <AuthFormContainer>
        <SampleForm />
      </AuthFormContainer>
    </AuthLayout>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <AuthLayout formTitle='Create your account' showFormTitle={false} showFooterPrompt={false} chrome='splash-b'>
      <AuthFormContainer>
        <SampleForm />
      </AuthFormContainer>
    </AuthLayout>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <AuthLayout formTitle='Sign in' showFormTitle={false} showFooterPrompt={false} layoutVariant='split'>
      <AuthFormContainer>
        <SampleForm />
      </AuthFormContainer>
    </AuthLayout>
}`,...m.parameters?.docs?.source}}}})))()}g();export{f as SignIn,p as SignUp,m as SplitShell,h as __namedExportsOrder,u as default};
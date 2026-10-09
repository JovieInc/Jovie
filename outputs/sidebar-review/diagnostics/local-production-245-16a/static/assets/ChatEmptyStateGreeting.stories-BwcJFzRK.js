import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import"./system-b-app-0raEe-jZ.js";import{n,t as r}from"./ChatEmptyStateGreeting-C6MYvQ71.js";var i,a,o,s,c,l;function u(){return(u=e((()=>{i=t(),n(),a={title:`Chat/EmptyState/Greeting`,component:r,parameters:{layout:`fullscreen`},args:{firstName:`Tim`},decorators:[e=>(0,i.jsx)(`div`,{className:`flex min-h-64 items-center justify-center bg-base p-6`,children:(0,i.jsx)(`div`,{className:`w-full max-w-2xl`,children:(0,i.jsx)(e,{})})})]},o={args:{insight:null}},s={args:{insight:`Your streams are up 320% today.`}},c={args:{insight:null}},l=[`GreetingOnly`,`WithInsight`,`NoInsightWhenSourceIsEmpty`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    insight: null
  }
}`,...o.parameters?.docs?.source},description:{story:`JOV-7150: no real insight exists — the greeting stands alone.`,...o.parameters?.docs?.description}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    insight: 'Your streams are up 320% today.'
  }
}`,...s.parameters?.docs?.source},description:{story:`JOV-7150: a real, server-computed insight (release momentum, a stat
change, or similar) replaces the greeting as the single sentence.`,...s.parameters?.docs?.description}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    insight: null
  }
}`,...c.parameters?.docs?.source},description:{story:"JOV-7150: never fabricate a number. When the insight source is empty\n(no active insight, profile not newly complete), the caller resolves\n`insight` to `null` rather than inventing one — same render as\n`GreetingOnly`, named separately to document the no-fabrication\ncontract explicitly (see `resolveChatEmptyStateInsight`).",...c.parameters?.docs?.description}}}})))()}u();export{o as GreetingOnly,c as NoInsightWhenSourceIsEmpty,s as WithInsight,l as __namedExportsOrder,a as default};
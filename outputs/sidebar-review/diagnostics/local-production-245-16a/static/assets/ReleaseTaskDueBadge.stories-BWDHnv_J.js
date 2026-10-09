import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./ReleaseTaskDueBadge-XO9GWR3V.js";function r(e){let t=new Date;return t.setDate(t.getDate()+e),t}var i,a,o,s,c,l;function u(){return(u=e((()=>{t(),i={title:`Dashboard/ReleaseTasks/ReleaseTaskDueBadge`,component:n,parameters:{layout:`centered`},args:{dueDate:r(14),dueDaysOffset:14}},a={},o={args:{dueDate:r(2),dueDaysOffset:2}},s={args:{isCompleted:!0}},c={args:{dueDate:null,dueDaysOffset:null,onSetDate:()=>{}}},l=[`Future`,`DueSoon`,`Completed`,`NoDate`],a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    dueDate: daysFromNow(2),
    dueDaysOffset: 2
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    isCompleted: true
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    dueDate: null,
    dueDaysOffset: null,
    onSetDate: () => {}
  }
}`,...c.parameters?.docs?.source}}}})))()}u();export{s as Completed,o as DueSoon,a as Future,c as NoDate,l as __namedExportsOrder,i as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{H as n,U as r}from"./removable-_8fTgXVw.js";import{c as i,s as a}from"./iframe-B1b4EUuv.js";import{s as o,t as s}from"./routes-NOD5Mahi.js";import{n as c,t as l}from"./keys-CNuKOgyu.js";import{n as u,t as d}from"./UsageMenuItem-DG4FrT-b.js";var f,p,m,h,g,_,v;function y(){return(y=e((()=>{f=t(),i(),r(),o(),l(),u(),{userEvent:p,within:m}=__STORYBOOK_MODULE_TEST__,h=new a({defaultOptions:{queries:{retry:!1,staleTime:1/0}}}),h.setQueryData(c.chat.usage(),{plan:`pro`,weeklyLimit:70,used:20,remaining:50,resetAt:`2026-08-24T18:00:00.000Z`,isExhausted:!1,warningThreshold:14,isNearLimit:!1}),g={title:`Organisms/UserButton/UsageMenuItem`,component:d,parameters:{layout:`centered`,backgrounds:{default:`dark`},docs:{description:{component:`Compact plan-usage disclosure used inside the signed-in user dropdown.`}}},decorators:[e=>(0,f.jsx)(n,{client:h,children:(0,f.jsx)(`div`,{className:`w-80 rounded-lg border border-subtle bg-surface-1 p-1 shadow-lg`,children:(0,f.jsx)(e,{})})})],args:{usageStatsUrl:s.SETTINGS_USAGE}},_={play:async({canvasElement:e})=>{let t=m(e);await p.click(t.getByRole(`button`,{name:/usage remaining/i}))}},v=[`Expanded`],_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', {
      name: /usage remaining/i
    }));
  }
}`,..._.parameters?.docs?.source}}}})))()}y();export{_ as Expanded,v as __namedExportsOrder,g as default};
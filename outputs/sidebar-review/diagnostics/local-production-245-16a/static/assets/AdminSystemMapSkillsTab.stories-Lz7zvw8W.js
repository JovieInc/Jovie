import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./AdminSystemMapSkillsTab-BNN0naCO.js";var r,i,a,o,s,c,l;function u(){return(u=e((()=>{t(),{expect:r,userEvent:i,within:a}=__STORYBOOK_MODULE_TEST__,o={title:`Features/Admin/System Map/AdminSystemMapSkillsTab`,component:n,parameters:{layout:`padded`}},s={},c={play:async({canvasElement:e})=>{let t=a(e);await i.click(t.getByRole(`button`,{name:/retouch/i})),await r(t.getByRole(`heading`,{name:`White Space Retouch Style`})).toBeVisible()}},l=[`RegisteredSkills`,`RetouchPrompt`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', {
      name: /retouch/i
    }));
    await expect(canvas.getByRole('heading', {
      name: 'White Space Retouch Style'
    })).toBeVisible();
  }
}`,...c.parameters?.docs?.source}}}})))()}u();export{s as RegisteredSkills,c as RetouchPrompt,l as __namedExportsOrder,o as default};
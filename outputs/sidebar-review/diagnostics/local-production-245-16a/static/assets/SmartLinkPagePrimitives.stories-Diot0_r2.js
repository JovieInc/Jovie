import{n as e,s as t}from"./rolldown-runtime-BcKkbAw3.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{i as r,r as i,t as a}from"./SmartLinkPagePrimitives-DF2TK2M0.js";import{t as o}from"./axe-BAL6MdNP.js";var s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{s=n(),c=t(o()),r(),{expect:l}=__STORYBOOK_MODULE_TEST__,u={title:`Release/SmartLinkArtworkCard`,component:a,parameters:{layout:`centered`,jovie:{uncoveredProps:[`name`,`handle`]}},args:{title:`Never Say A Word`,artworkUrl:`/art.jpg`}},d={},f={parameters:{themes:{themeOverride:`dark`},a11y:{test:`error`}},render:()=>(0,s.jsx)(`div`,{className:`bg-base p-5 text-foreground`,children:(0,s.jsx)(i,{})}),play:async({canvasElement:e})=>{let{violations:t}=await c.default.run(e,{runOnly:{type:`rule`,values:[`color-contrast`]}});await l(t).toEqual([])}},p={...f,parameters:{themes:{themeOverride:`light`},a11y:{test:`error`}}},m=[`Default`,`PoweredByDark`,`PoweredByLight`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  parameters: {
    themes: {
      themeOverride: 'dark'
    },
    a11y: {
      test: 'error'
    }
  },
  render: () => <div className='bg-base p-5 text-foreground'>
      <SmartLinkPoweredByFooter />
    </div>,
  play: async ({
    canvasElement
  }) => {
    const {
      violations
    } = await axe.run(canvasElement, {
      runOnly: {
        type: 'rule',
        values: ['color-contrast']
      }
    });
    await expect(violations).toEqual([]);
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  ...PoweredByDark,
  parameters: {
    themes: {
      themeOverride: 'light'
    },
    a11y: {
      test: 'error'
    }
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{d as Default,f as PoweredByDark,p as PoweredByLight,m as __namedExportsOrder,u as default};
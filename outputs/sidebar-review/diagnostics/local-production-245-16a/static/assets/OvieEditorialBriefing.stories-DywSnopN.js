import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./OvieEditorialBriefing-DWljwba2.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={greeting:`Good morning, Tim.`,updatedLabel:`Updated Sep 28, 8:00 AM PDT`,signal:{id:`activation.first-user`,title:`The first real user completed onboarding`,summary:`Activation has moved from theory to observed behavior.`,currentValue:`1 activated user`,delta:`+1 today`,target:`Learn what made the path work`,sourceLabel:`Founder Funnel`,nextAction:`Review the session and preserve the shortest successful path.`,removalEvent:`The activation lesson is recorded and applied.`,summerCanAct:!0},actions:[{id:`activation.first-user:next`,label:`Start The Next Step`,prompt:`Review the first activation with me.`},{id:`activation.first-user:evidence`,label:`Show The Evidence`,prompt:`Show the evidence for the first activation.`}]},u={title:`Jovie/Components/OvieEditorialBriefing`,component:r,parameters:{layout:`fullscreen`,backgrounds:{default:`dark`}},decorators:[e=>(0,i.jsx)(`div`,{className:`flex min-h-screen w-full flex-col`,children:(0,i.jsx)(e,{})})],args:{briefing:l,onSelectAction:o()}},d={play:async({args:e,canvasElement:t})=>{let n=c(t);await a(n.getByRole(`heading`,{name:`The first real user completed onboarding`})).toBeInTheDocument(),await s.click(n.getByRole(`button`,{name:`Show The Evidence`})),await a(e.onSelectAction).toHaveBeenCalledWith(`Show the evidence for the first activation.`)}},f={args:{briefing:{...l,signal:{...l.signal,delta:null,target:null}}}},p=[`Default`,`WithoutDeltaOrTarget`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', {
      name: 'The first real user completed onboarding'
    })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', {
      name: 'Show The Evidence'
    }));
    await expect(args.onSelectAction).toHaveBeenCalledWith('Show the evidence for the first activation.');
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    briefing: {
      ...briefing,
      signal: {
        ...briefing.signal,
        delta: null,
        target: null
      }
    }
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{d as Default,f as WithoutDeltaOrTarget,p as __namedExportsOrder,u as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./starter-actions-B7n_BUNl.js";import{n as i,t as a}from"./ChatActionCard-CryZkgwW.js";function o(e){let t=r[e];return{title:t.label,body:t.description,actionLabel:t.actionLabel,icon:t.icon}}var s,c,l,u,d,f,p,m,h,g,_,v;function y(){return(y=e((()=>{s=t(),n(),i(),{expect:c,fn:l,userEvent:u,within:d}=__STORYBOOK_MODULE_TEST__,f={title:`Jovie/Components/ChatActionCard`,component:a,parameters:{layout:`centered`,backgrounds:{default:`dark`}},decorators:[e=>(0,s.jsx)(`div`,{className:`w-full max-w-md`,children:(0,s.jsx)(e,{})})],args:{title:`Review imported links`,body:`Jovie found three profile links that need confirmation before they appear publicly.`,actionLabel:`Review links`,onAct:l(),onDismiss:l()}},p={play:async({args:e,canvasElement:t})=>{let n=d(t);await u.click(n.getByRole(`button`,{name:e.actionLabel})),await c(e.onAct).toHaveBeenCalledOnce(),await u.click(n.getByRole(`button`,{name:`Dismiss ${e.title}`})),await c(e.onDismiss).toHaveBeenCalledOnce()}},m={args:o(`plan-release`)},h={args:o(`generate-album-art`)},g={args:o(`build-artist-profile`)},_={args:o(`review-signals`)},v=[`ReviewAlert`,`PlanRelease`,`GenerateAlbumArt`,`BuildProfile`,`ReviewSignals`],p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  play: async ({
    args,
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', {
      name: args.actionLabel
    }));
    await expect(args.onAct).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', {
      name: \`Dismiss \${args.title}\`
    }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: starterArgs('plan-release')
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: starterArgs('generate-album-art')
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: starterArgs('build-artist-profile')
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: starterArgs('review-signals')
}`,..._.parameters?.docs?.source}}}})))()}y();export{g as BuildProfile,h as GenerateAlbumArt,m as PlanRelease,p as ReviewAlert,_ as ReviewSignals,v as __namedExportsOrder,f as default};
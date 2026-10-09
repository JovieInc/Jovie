import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./CollapsibleSectionHeading-DZg03VI1.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),{expect:a,fn:o,userEvent:s,within:c}=__STORYBOOK_MODULE_TEST__,l={title:`Molecules/Drawer/CollapsibleSectionHeading`,component:r,parameters:{layout:`centered`},decorators:[e=>(0,i.jsx)(`div`,{className:`w-full max-w-sm text-primary-token`,children:e()})],args:{isOpen:!0,onToggle:o(),children:`Audience details`,"aria-controls":`audience-details`}},u={play:async({canvasElement:e,args:t})=>{let n=c(e).getByRole(`button`,{name:`Audience details`});await a(n).toHaveAttribute(`aria-expanded`,`true`),await s.click(n),await a(t.onToggle).toHaveBeenCalled()}},d={args:{isOpen:!1}},f={args:{children:(0,i.jsxs)(`span`,{className:`flex items-center gap-2`,children:[(0,i.jsx)(`span`,{"aria-hidden":`true`,className:`size-1.5 rounded-full bg-success`}),`Connected audience`]})}},p=[`Open`,`Collapsed`,`WithCustomContent`],u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement,
    args
  }) => {
    const heading = within(canvasElement).getByRole('button', {
      name: 'Audience details'
    });
    await expect(heading).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(heading);
    await expect(args.onToggle).toHaveBeenCalled();
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    isOpen: false
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    children: <span className='flex items-center gap-2'>
        <span aria-hidden='true' className='size-1.5 rounded-full bg-success' />
        Connected audience
      </span>
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{d as Collapsed,u as Open,f as WithCustomContent,p as __namedExportsOrder,l as default};
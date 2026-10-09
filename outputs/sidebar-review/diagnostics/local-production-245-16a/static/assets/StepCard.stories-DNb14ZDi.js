import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./StepCard-BH0N9mIa.js";var i,a,o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{i=t(),n(),a=(0,i.jsx)(`svg`,{className:`h-6 w-6`,fill:`none`,viewBox:`0 0 24 24`,stroke:`currentColor`,"aria-hidden":`true`,children:(0,i.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,strokeWidth:2,d:`M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1`})}),o=(0,i.jsx)(`svg`,{className:`h-6 w-6`,fill:`none`,viewBox:`0 0 24 24`,stroke:`currentColor`,"aria-hidden":`true`,children:(0,i.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,strokeWidth:2,d:`M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z`})}),s=(0,i.jsx)(`svg`,{className:`h-6 w-6`,fill:`none`,viewBox:`0 0 24 24`,stroke:`currentColor`,"aria-hidden":`true`,children:(0,i.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,strokeWidth:2,d:`M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15`})}),c={title:`Atoms/StepCard`,component:r,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{showConnectionLine:{control:{type:`boolean`}},interactive:{control:{type:`boolean`}}}},l={args:{stepNumber:`01`,title:`Connect Your Spotify`,description:`Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.`,icon:a}},u={args:{stepNumber:`02`,title:`Get Your Link`,description:`Get your custom jov.ie link and professional profile. Add your social media and merch links.`,icon:o}},d={args:{stepNumber:`03`,title:`Fans Stream Your Music`,description:`Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.`,icon:s}},f={args:{stepNumber:`01`,title:`Connect Your Spotify`,description:`Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.`,icon:a,showConnectionLine:!0}},p={args:{stepNumber:`01`,title:`Static Step Card`,description:`This step card has no hover effects and is purely informational.`,icon:a,interactive:!1}},m={render:()=>(0,i.jsxs)(`div`,{className:`grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl`,children:[(0,i.jsx)(r,{stepNumber:`01`,title:`Connect Your Spotify`,description:`Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.`,icon:a,showConnectionLine:!0}),(0,i.jsx)(r,{stepNumber:`02`,title:`Get Your Link`,description:`Get your custom jov.ie link and professional profile. Add your social media and merch links.`,icon:o,showConnectionLine:!0}),(0,i.jsx)(r,{stepNumber:`03`,title:`Fans Stream Your Music`,description:`Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.`,icon:s})]})},h={render:()=>(0,i.jsxs)(`div`,{className:`max-w-6xl p-8 bg-gray-50 dark:bg-gray-900 rounded-lg`,children:[(0,i.jsxs)(`div`,{className:`text-center mb-12`,children:[(0,i.jsx)(`h2`,{className:`text-4xl font-bold mb-4`,children:`How It Works`}),(0,i.jsx)(`p`,{className:`text-gray-600 dark:text-gray-300`,children:`From Spotify artist to fan conversion in 60 seconds`})]}),(0,i.jsxs)(`div`,{className:`grid grid-cols-1 md:grid-cols-3 gap-12`,children:[(0,i.jsx)(r,{stepNumber:`01`,title:`Connect Your Spotify`,description:`Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.`,icon:a,showConnectionLine:!0}),(0,i.jsx)(r,{stepNumber:`02`,title:`Get Your Link`,description:`Get your custom jov.ie link and professional profile. Add your social media and merch links.`,icon:o,showConnectionLine:!0}),(0,i.jsx)(r,{stepNumber:`03`,title:`Fans Stream Your Music`,description:`Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.`,icon:s})]})]})},g=[`Default`,`Step2`,`Step3`,`WithConnectionLine`,`NonInteractive`,`AllSteps`,`InHowItWorksSection`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    stepNumber: '01',
    title: 'Connect Your Spotify',
    description: 'Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.',
    icon: LinkIcon
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    stepNumber: '02',
    title: 'Get Your Link',
    description: 'Get your custom jov.ie link and professional profile. Add your social media and merch links.',
    icon: LockIcon
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    stepNumber: '03',
    title: 'Fans Stream Your Music',
    description: 'Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.',
    icon: MusicIcon
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    stepNumber: '01',
    title: 'Connect Your Spotify',
    description: 'Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.',
    icon: LinkIcon,
    showConnectionLine: true
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    stepNumber: '01',
    title: 'Static Step Card',
    description: 'This step card has no hover effects and is purely informational.',
    icon: LinkIcon,
    interactive: false
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid grid-cols-1 md:grid-cols-3 gap-12 max-w-6xl'>
      <StepCard stepNumber='01' title='Connect Your Spotify' description='Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.' icon={LinkIcon} showConnectionLine={true} />
      <StepCard stepNumber='02' title='Get Your Link' description='Get your custom jov.ie link and professional profile. Add your social media and merch links.' icon={LockIcon} showConnectionLine={true} />
      <StepCard stepNumber='03' title='Fans Stream Your Music' description='Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.' icon={MusicIcon} />
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  render: () => <div className='max-w-6xl p-8 bg-gray-50 dark:bg-gray-900 rounded-lg'>
      <div className='text-center mb-12'>
        <h2 className='text-4xl font-bold mb-4'>How It Works</h2>
        <p className='text-gray-600 dark:text-gray-300'>
          From Spotify artist to fan conversion in 60 seconds
        </p>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-12'>
        <StepCard stepNumber='01' title='Connect Your Spotify' description='Search and verify your Spotify artist profile in seconds. We pull your latest releases automatically.' icon={LinkIcon} showConnectionLine={true} />
        <StepCard stepNumber='02' title='Get Your Link' description='Get your custom jov.ie link and professional profile. Add your social media and merch links.' icon={LockIcon} showConnectionLine={true} />
        <StepCard stepNumber='03' title='Fans Stream Your Music' description='Fans discover and stream your music instantly. Smart routing sends them to their preferred platform.' icon={MusicIcon} />
      </div>
    </div>
}`,...h.parameters?.docs?.source}}}})))()}_();export{m as AllSteps,l as Default,h as InHowItWorksSection,p as NonInteractive,u as Step2,d as Step3,f as WithConnectionLine,g as __namedExportsOrder,c as default};
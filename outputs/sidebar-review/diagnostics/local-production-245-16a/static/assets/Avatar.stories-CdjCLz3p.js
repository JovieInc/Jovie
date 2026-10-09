import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./Avatar-Bn2IIjLh.js";var i,a,o,s,c,l,u,d,f,p;function m(){return(m=e((()=>{i=t(),n(),a={title:`Atoms/Avatar`,component:r,parameters:{layout:`centered`,docs:{description:{component:`Unified Avatar component for display-only usage with optimized loading, fallback states, and accessibility support.`}}},tags:[`autodocs`],argTypes:{size:{control:`select`,options:[`xs`,`sm`,`md`,`lg`,`xl`,`2xl`],description:`Avatar size`},shape:{control:`select`,options:[`person`,`artwork`],description:`Person avatars are circular; release artwork is rounded-square`},src:{control:`text`,description:`Avatar image source URL`},name:{control:`text`,description:`Display name for fallback initials`},alt:{control:`text`,description:`Alt text for the image`}}},o={args:{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`John Doe`,name:`John Doe`,size:`md`,shape:`person`}},s={args:{src:null,alt:`Jane Smith`,name:`Jane Smith`,size:`md`,shape:`person`},parameters:{docs:{description:{story:`Avatar with no image source, showing fallback initials.`}}}},c={render:()=>(0,i.jsxs)(`div`,{className:`flex items-center space-x-4`,children:[(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Avatar`,name:`John`,size:`xs`}),(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Avatar`,name:`John`,size:`sm`}),(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Avatar`,name:`John`,size:`md`}),(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Avatar`,name:`John`,size:`lg`}),(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Avatar`,name:`John`,size:`xl`}),(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Avatar`,name:`John`,size:`2xl`})]}),parameters:{docs:{description:{story:`Avatar sizes from the canonical contract: xs (16px), sm (20px), md (24px), lg (32px), xl (40px), 2xl (96px).`}}}},l={render:()=>(0,i.jsxs)(`div`,{className:`flex items-center space-x-4`,children:[(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Artist`,name:`John`,size:`2xl`,shape:`person`}),(0,i.jsx)(r,{src:`https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face`,alt:`Release artwork`,name:`Midnight Echo`,size:`2xl`,shape:`artwork`})]}),parameters:{docs:{description:{story:`Person avatars stay circular. Release artwork uses the rounded-square crop.`}}}},u={render:()=>(0,i.jsxs)(`div`,{className:`flex items-center space-x-4`,children:[(0,i.jsx)(r,{src:null,alt:`John Doe`,name:`John Doe`}),(0,i.jsx)(r,{src:null,alt:`Jane Smith`,name:`Jane Smith`}),(0,i.jsx)(r,{src:null,alt:`Alex Johnson`,name:`Alex Johnson`}),(0,i.jsx)(r,{src:null,alt:`Maria Garcia`,name:`Maria Garcia`}),(0,i.jsx)(r,{src:null,alt:`Single Name`,name:`Single`}),(0,i.jsx)(r,{src:null,alt:`No Name`,name:``})]}),parameters:{docs:{description:{story:`Avatar fallback states showing initials generated from different name formats.`}}}},d={args:{src:`https://broken-url.example.com/image.jpg`,alt:`Broken Image`,name:`Error Test`,size:`lg`},parameters:{docs:{description:{story:`Avatar with a broken image URL, demonstrating the error fallback to initials.`}}}},f={args:{src:`https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face`,alt:`Priority Avatar`,name:`Priority User`,priority:!0,size:`lg`},parameters:{docs:{description:{story:`Avatar with high priority loading for above-the-fold content.`}}}},p=[`Default`,`Fallback`,`Sizes`,`PersonAndArtwork`,`FallbackInitials`,`ErrorState`,`HighPriority`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    src: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
    alt: 'John Doe',
    name: 'John Doe',
    size: 'md',
    shape: 'person'
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    src: null,
    alt: 'Jane Smith',
    name: 'Jane Smith',
    size: 'md',
    shape: 'person'
  },
  parameters: {
    docs: {
      description: {
        story: 'Avatar with no image source, showing fallback initials.'
      }
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center space-x-4'>
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Avatar' name='John' size='xs' />
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Avatar' name='John' size='sm' />
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Avatar' name='John' size='md' />
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Avatar' name='John' size='lg' />
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Avatar' name='John' size='xl' />
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Avatar' name='John' size='2xl' />
    </div>,
  parameters: {
    docs: {
      description: {
        story: 'Avatar sizes from the canonical contract: xs (16px), sm (20px), md (24px), lg (32px), xl (40px), 2xl (96px).'
      }
    }
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center space-x-4'>
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Artist' name='John' size='2xl' shape='person' />
      <Avatar src='https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face' alt='Release artwork' name='Midnight Echo' size='2xl' shape='artwork' />
    </div>,
  parameters: {
    docs: {
      description: {
        story: 'Person avatars stay circular. Release artwork uses the rounded-square crop.'
      }
    }
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  render: () => <div className='flex items-center space-x-4'>
      <Avatar src={null} alt='John Doe' name='John Doe' />
      <Avatar src={null} alt='Jane Smith' name='Jane Smith' />
      <Avatar src={null} alt='Alex Johnson' name='Alex Johnson' />
      <Avatar src={null} alt='Maria Garcia' name='Maria Garcia' />
      <Avatar src={null} alt='Single Name' name='Single' />
      <Avatar src={null} alt='No Name' name='' />
    </div>,
  parameters: {
    docs: {
      description: {
        story: 'Avatar fallback states showing initials generated from different name formats.'
      }
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    src: 'https://broken-url.example.com/image.jpg',
    alt: 'Broken Image',
    name: 'Error Test',
    size: 'lg'
  },
  parameters: {
    docs: {
      description: {
        story: 'Avatar with a broken image URL, demonstrating the error fallback to initials.'
      }
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    src: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    alt: 'Priority Avatar',
    name: 'Priority User',
    priority: true,
    size: 'lg'
  },
  parameters: {
    docs: {
      description: {
        story: 'Avatar with high priority loading for above-the-fold content.'
      }
    }
  }
}`,...f.parameters?.docs?.source}}}})))()}m();export{o as Default,d as ErrorState,s as Fallback,u as FallbackInitials,f as HighPriority,l as PersonAndArtwork,c as Sizes,p as __namedExportsOrder,a as default};
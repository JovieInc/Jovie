import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./ProfileNavButton-DstNBjqX.js";var i,a,o,s,c,l;function u(){return(u=e((()=>{i=t(),n(),a={title:`Molecules/ProfileNavButton`,component:r,parameters:{layout:`centered`,jovie:{uncoveredProps:[`loading`]},docs:{description:{component:`Navigation button for profile pages. Shows Jovie icon on main profile (links to homepage) and back arrow on sub-pages (listen, tip, etc.).`}}},tags:[`autodocs`],argTypes:{showBackButton:{control:`boolean`,description:`When true, shows back arrow; when false, shows Jovie icon`},artistHandle:{control:`text`,description:`The artist handle for back navigation`}},decorators:[e=>(0,i.jsx)(`div`,{className:`relative w-32 h-32 bg-gray-100 dark:bg-gray-900 rounded-lg`,children:(0,i.jsx)(`div`,{className:`absolute top-4 left-4`,children:(0,i.jsx)(e,{})})})]},o={args:{showBackButton:!1,artistHandle:`testartist`},parameters:{docs:{description:{story:`On the main profile page, shows the Jovie icon which links to the homepage.`}}}},s={args:{showBackButton:!0,artistHandle:`testartist`},parameters:{docs:{description:{story:`On sub-pages (listen, tip, notifications), shows a back arrow that navigates to the main profile.`}}}},c={args:{showBackButton:!1,artistHandle:`testartist`},parameters:{backgrounds:{default:`dark`}},decorators:[e=>(0,i.jsx)(`div`,{className:`dark relative w-32 h-32 bg-gray-900 rounded-lg`,children:(0,i.jsx)(`div`,{className:`absolute top-4 left-4`,children:(0,i.jsx)(e,{})})})]},l=[`JovieIcon`,`BackButton`,`DarkMode`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    showBackButton: false,
    artistHandle: 'testartist'
  },
  parameters: {
    docs: {
      description: {
        story: 'On the main profile page, shows the Jovie icon which links to the homepage.'
      }
    }
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    showBackButton: true,
    artistHandle: 'testartist'
  },
  parameters: {
    docs: {
      description: {
        story: 'On sub-pages (listen, tip, notifications), shows a back arrow that navigates to the main profile.'
      }
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    showBackButton: false,
    artistHandle: 'testartist'
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  },
  decorators: [Story => <div className='dark relative w-32 h-32 bg-gray-900 rounded-lg'>
        <div className='absolute top-4 left-4'>
          <Story />
        </div>
      </div>]
}`,...c.parameters?.docs?.source}}}})))()}u();export{s as BackButton,c as DarkMode,o as JovieIcon,l as __namedExportsOrder,a as default};
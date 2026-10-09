import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./AnalyticsCard-rZPz5GO4.js";var i,a,o,s,c,l,u,d,f,p,m,h;function g(){return(g=e((()=>{i=t(),n(),a=({totalClicks:e=1250,spotifyClicks:t=750,socialClicks:n=350,recentClicks:a=120,loading:o=!1,error:s=!1,numberOfCards:c=4})=>{let l=[{id:`total_clicks`,title:`Total Clicks`,value:e,metadata:`Last 30 days`},{id:`spotify_clicks`,title:`Spotify Clicks`,value:t,metadata:`Music platform clicks`},{id:`social_clicks`,title:`Social Clicks`,value:n,metadata:`Social media clicks`},{id:`recent_activity`,title:`Recent Activity`,value:a,metadata:`Last 7 days`}].slice(0,c);return o?(0,i.jsx)(`div`,{className:`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4`,children:l.map(e=>(0,i.jsx)(r,{title:`Loading...`,value:`...`},e.id))}):s?(0,i.jsx)(`div`,{className:`text-center text-red-600`,children:(0,i.jsx)(`p`,{children:`Failed to load analytics`})}):(0,i.jsx)(`div`,{className:`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4`,children:l.map(e=>(0,i.jsx)(r,{title:e.title,value:e.value,metadata:e.metadata},e.id))})},o={title:`Dashboard/Molecules/AnalyticsCards`,component:a,parameters:{layout:`padded`,docs:{description:{component:`A grid of analytics cards displaying various metrics. This Storybook mock renders from provided props (static demo data) and displays it in a responsive grid layout.`}}},tags:[`autodocs`],argTypes:{totalClicks:{control:{type:`number`},description:`Total number of clicks in the last 30 days`},spotifyClicks:{control:{type:`number`},description:`Number of Spotify clicks`},socialClicks:{control:{type:`number`},description:`Number of social media clicks`},recentClicks:{control:{type:`number`},description:`Number of clicks in the last 7 days`},loading:{control:{type:`boolean`},description:`Whether the component is in a loading state`},error:{control:{type:`boolean`},description:`Whether to show an error state`},numberOfCards:{control:{type:`range`,min:1,max:4,step:1},description:`Number of cards to display`}}},s={args:{totalClicks:1250,spotifyClicks:750,socialClicks:350,recentClicks:120,loading:!1,error:!1,numberOfCards:4}},c={args:{...s.args,loading:!0}},l={args:{...s.args,error:!0}},u={args:{...s.args,totalClicks:0,spotifyClicks:0,socialClicks:0,recentClicks:0}},d={args:{...s.args,numberOfCards:2}},f={args:{...s.args,numberOfCards:3}},p={render:()=>(0,i.jsxs)(`div`,{className:`space-y-8`,children:[(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`h3`,{className:`text-lg font-semibold mb-2`,children:`Desktop View (4 columns)`}),(0,i.jsx)(`div`,{className:`w-full`,children:(0,i.jsx)(a,{totalClicks:1250,spotifyClicks:750,socialClicks:350,recentClicks:120})})]}),(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`h3`,{className:`text-lg font-semibold mb-2`,children:`Tablet View (2 columns)`}),(0,i.jsx)(`div`,{className:`w-192 mx-auto`,children:(0,i.jsx)(a,{totalClicks:1250,spotifyClicks:750,socialClicks:350,recentClicks:120})})]}),(0,i.jsxs)(`div`,{children:[(0,i.jsx)(`h3`,{className:`text-lg font-semibold mb-2`,children:`Mobile View (1 column)`}),(0,i.jsx)(`div`,{className:`w-94 mx-auto`,children:(0,i.jsx)(a,{totalClicks:1250,spotifyClicks:750,socialClicks:350,recentClicks:120})})]})]})},m={render:()=>(0,i.jsxs)(`div`,{className:`grid grid-cols-1 md:grid-cols-2 gap-8`,children:[(0,i.jsxs)(`div`,{className:`p-6 bg-surface-1 rounded-lg`,children:[(0,i.jsx)(`h3`,{className:`text-lg font-semibold mb-4`,children:`Light Theme`}),(0,i.jsx)(a,{totalClicks:1250,spotifyClicks:750,socialClicks:350,recentClicks:120})]}),(0,i.jsxs)(`div`,{className:`p-6 bg-gray-900 rounded-lg`,children:[(0,i.jsx)(`h3`,{className:`text-lg font-semibold mb-4 text-primary-token`,children:`Dark Theme`}),(0,i.jsx)(`div`,{className:`dark`,children:(0,i.jsx)(a,{totalClicks:1250,spotifyClicks:750,socialClicks:350,recentClicks:120})})]})]})},h=[`Default`,`Loading`,`Error`,`EmptyState`,`TwoCards`,`ThreeCards`,`ResponsiveLayout`,`DarkMode`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    totalClicks: 1250,
    spotifyClicks: 750,
    socialClicks: 350,
    recentClicks: 120,
    loading: false,
    error: false,
    numberOfCards: 4
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    loading: true
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    error: true
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    totalClicks: 0,
    spotifyClicks: 0,
    socialClicks: 0,
    recentClicks: 0
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    numberOfCards: 2
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    ...Default.args,
    numberOfCards: 3
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  render: () => <div className='space-y-8'>
      <div>
        <h3 className='text-lg font-semibold mb-2'>Desktop View (4 columns)</h3>
        <div className='w-full'>
          <MockAnalyticsCards totalClicks={1250} spotifyClicks={750} socialClicks={350} recentClicks={120} />
        </div>
      </div>

      <div>
        <h3 className='text-lg font-semibold mb-2'>Tablet View (2 columns)</h3>
        <div className='w-192 mx-auto'>
          <MockAnalyticsCards totalClicks={1250} spotifyClicks={750} socialClicks={350} recentClicks={120} />
        </div>
      </div>

      <div>
        <h3 className='text-lg font-semibold mb-2'>Mobile View (1 column)</h3>
        <div className='w-94 mx-auto'>
          <MockAnalyticsCards totalClicks={1250} spotifyClicks={750} socialClicks={350} recentClicks={120} />
        </div>
      </div>
    </div>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  render: () => <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
      <div className='p-6 bg-surface-1 rounded-lg'>
        <h3 className='text-lg font-semibold mb-4'>Light Theme</h3>
        <MockAnalyticsCards totalClicks={1250} spotifyClicks={750} socialClicks={350} recentClicks={120} />
      </div>
      <div className='p-6 bg-gray-900 rounded-lg'>
        <h3 className='text-lg font-semibold mb-4 text-primary-token'>
          Dark Theme
        </h3>
        <div className='dark'>
          <MockAnalyticsCards totalClicks={1250} spotifyClicks={750} socialClicks={350} recentClicks={120} />
        </div>
      </div>
    </div>
}`,...m.parameters?.docs?.source}}}})))()}g();export{m as DarkMode,s as Default,u as EmptyState,l as Error,c as Loading,p as ResponsiveLayout,f as ThreeCards,d as TwoCards,h as __namedExportsOrder,o as default};
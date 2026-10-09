import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./SidebarBottomNowPlaying-BUikr4ZF.js";var i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{i=t(),n(),a={title:`Shell/SidebarBottomNowPlaying`,component:r,parameters:{layout:`centered`},args:{isPlaying:!1,onPlay:()=>void 0,track:{trackTitle:`Never Say A Word`,artistName:`Tim White`,artworkUrl:`https://placehold.co/640x640/111827/E5E7EB?text=Artwork`}}},o={},s={args:{isPlaying:!0}},c={args:{track:{trackTitle:null,artistName:null,artworkUrl:null}}},l={args:{track:{trackTitle:`A Very Long Track Title That Must Truncate Without Widening the Sidebar`,artistName:`An Artist With An Equally Long Display Name`,artworkUrl:`https://placehold.co/640x640/111827/E5E7EB?text=Artwork`}},decorators:[e=>(0,i.jsx)(`div`,{className:`w-57`,children:(0,i.jsx)(e,{})})]},u={args:{collapsed:!0,isPlaying:!0}},d={render:e=>(0,i.jsxs)(`div`,{className:`grid grid-cols-2 gap-6 bg-base p-6`,children:[(0,i.jsx)(`div`,{className:`w-57 bg-base p-2`,children:(0,i.jsx)(r,{...e})}),(0,i.jsx)(`div`,{className:`dark w-57 bg-base p-2`,children:(0,i.jsx)(r,{...e})})]})},f=[`Paused`,`Playing`,`Idle`,`LongTitle`,`CollapsedSidebar`,`LightAndDark`],o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    isPlaying: true
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    track: {
      trackTitle: null,
      artistName: null,
      artworkUrl: null
    }
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    track: {
      trackTitle: 'A Very Long Track Title That Must Truncate Without Widening the Sidebar',
      artistName: 'An Artist With An Equally Long Display Name',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork'
    }
  },
  decorators: [StoryComponent => <div className='w-57'>
        <StoryComponent />
      </div>]
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    collapsed: true,
    isPlaying: true
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: args => <div className='grid grid-cols-2 gap-6 bg-base p-6'>
      <div className='w-57 bg-base p-2'>
        <SidebarBottomNowPlaying {...args} />
      </div>
      <div className='dark w-57 bg-base p-2'>
        <SidebarBottomNowPlaying {...args} />
      </div>
    </div>
}`,...d.parameters?.docs?.source}}}})))()}p();export{u as CollapsedSidebar,c as Idle,d as LightAndDark,l as LongTitle,o as Paused,s as Playing,f as __namedExportsOrder,a as default};
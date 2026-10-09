import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./ArtistInfo-CTOk8knS.js";var r,i,a,o,s,c,l,u,d,f,p,m;function h(){return(h=e((()=>{t(),r={title:`Molecules/ArtistInfo`,component:n,parameters:{layout:`centered`},tags:[`autodocs`],argTypes:{avatarSize:{control:{type:`select`},options:[`sm`,`md`,`lg`,`xl`,`2xl`]},nameSize:{control:{type:`select`},options:[`sm`,`md`,`lg`,`xl`]}}},i={id:`1`,handle:`taylorswift`,name:`Taylor Swift`,image_url:`https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face`,tagline:`Grammy Award-winning singer-songwriter known for narrative songs about her personal life.`,is_verified:!0,owner_user_id:`1`,spotify_id:``,published:!0,is_featured:!1,created_at:new Date().toISOString(),marketing_opt_out:!1},a={args:{artist:i}},o={args:{artist:{...i,is_verified:!0}}},s={args:{artist:{...i,is_verified:!1}}},c={args:{artist:i,subtitle:`Live at Madison Square Garden 2024`}},l={args:{artist:i,avatarSize:`sm`,nameSize:`sm`}},u={args:{artist:i,avatarSize:`xl`,nameSize:`xl`}},d={args:{artist:{...i,tagline:`Multi-platinum recording artist, songwriter, and performer with over 200 million records sold worldwide. Known for her storytelling through music and her massive cultural impact.`}}},f={args:{artist:{...i,name:`Rising Star`,handle:`risingstar`,is_verified:!1,tagline:void 0}}},p={args:{artist:i},parameters:{backgrounds:{default:`dark`}}},m=[`Default`,`Verified`,`Unverified`,`WithSubtitle`,`SmallAvatar`,`LargeAvatar`,`LongTagline`,`NewArtist`,`InDarkMode`],a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist
  }
}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    artist: {
      ...mockArtist,
      is_verified: true
    }
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    artist: {
      ...mockArtist,
      is_verified: false
    }
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    subtitle: 'Live at Madison Square Garden 2024'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    avatarSize: 'sm',
    nameSize: 'sm'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    avatarSize: 'xl',
    nameSize: 'xl'
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    artist: {
      ...mockArtist,
      tagline: 'Multi-platinum recording artist, songwriter, and performer with over 200 million records sold worldwide. Known for her storytelling through music and her massive cultural impact.'
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    artist: {
      ...mockArtist,
      name: 'Rising Star',
      handle: 'risingstar',
      is_verified: false,
      tagline: undefined // Will use default tagline
    }
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...p.parameters?.docs?.source}}}})))()}h();export{a as Default,p as InDarkMode,u as LargeAvatar,d as LongTagline,f as NewArtist,l as SmallAvatar,s as Unverified,o as Verified,c as WithSubtitle,m as __namedExportsOrder,r as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./button-BSHhPV4e.js";import{n as i,t as a}from"./ArtistInfo-CTOk8knS.js";import{n as o,t as s}from"./Container-BAXViFRB.js";import{n as c,t as l}from"./FrostedContainer-CCV8Gub3.js";function u({artist:e,subtitle:t,children:n,containerVariant:r=`default`,backgroundPattern:i=`grid`,showGradientBlurs:o=!0,avatarSize:c=`xl`,nameSize:u=`lg`,maxWidthClass:f=`w-full max-w-md`}){return(0,d.jsx)(l,{variant:r,backgroundPattern:i,showGradientBlurs:o,children:(0,d.jsx)(s,{children:(0,d.jsx)(`div`,{className:`flex min-h-svh flex-col py-12 relative z-10`,children:(0,d.jsx)(`div`,{className:`flex-1 flex flex-col items-center justify-center px-4`,children:(0,d.jsxs)(`div`,{className:`${f} space-y-8`,children:[(0,d.jsx)(a,{artist:e,subtitle:t,avatarSize:c===`2xl`?`xl`:c,nameSize:u}),n]})})})})})}var d;function f(){return(f=e((()=>{d=t(),i(),c(),o()})))()}var p,m,h,g,_,v,y,b,x,S,C,w,T,E,D;function O(){return(O=e((()=>{p=t(),n(),f(),m={title:`Organisms/ProfileSection`,component:u,parameters:{layout:`fullscreen`},tags:[`autodocs`],argTypes:{containerVariant:{control:{type:`select`},options:[`default`,`glass`,`solid`]},backgroundPattern:{control:{type:`select`},options:[`grid`,`dots`,`gradient`,`none`]},avatarSize:{control:{type:`select`},options:[`sm`,`md`,`lg`,`xl`,`2xl`]},nameSize:{control:{type:`select`},options:[`sm`,`md`,`lg`,`xl`]}}},h={id:`1`,handle:`taylorswift`,name:`Taylor Swift`,image_url:`https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop&crop=face`,tagline:`Grammy Award-winning singer-songwriter known for narrative songs about her personal life.`,is_verified:!0,owner_user_id:`1`,spotify_id:``,published:!0,is_featured:!1,created_at:new Date().toISOString(),marketing_opt_out:!1},g={args:{artist:h}},_={args:{artist:h,subtitle:`Live at Madison Square Garden 2024`}},v={args:{artist:h,children:(0,p.jsxs)(`div`,{className:`space-y-4 w-full`,children:[(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`}),(0,p.jsxs)(`div`,{className:`grid grid-cols-2 gap-3`,children:[(0,p.jsx)(r,{variant:`outline`,children:`Follow`}),(0,p.jsx)(r,{variant:`outline`,children:`Share`})]})]})}},y={args:{artist:h,containerVariant:`glass`,children:(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`})}},b={args:{artist:h,containerVariant:`solid`,children:(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`})}},x={args:{artist:h,backgroundPattern:`dots`,children:(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`})}},S={args:{artist:h,backgroundPattern:`gradient`,containerVariant:`glass`,children:(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`})}},C={args:{artist:h,backgroundPattern:`none`,showGradientBlurs:!1,containerVariant:`solid`,children:(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`})}},w={args:{artist:h,avatarSize:`sm`,nameSize:`sm`,maxWidthClass:`w-full max-w-xs`,children:(0,p.jsx)(r,{className:`w-full`,size:`sm`,children:`Follow`})}},T={args:{artist:h,avatarSize:`xl`,nameSize:`xl`,maxWidthClass:`w-full max-w-lg`,children:(0,p.jsxs)(`div`,{className:`space-y-6 w-full`,children:[(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`}),(0,p.jsxs)(`div`,{className:`text-center text-gray-600 dark:text-gray-400`,children:[(0,p.jsx)(`p`,{children:`Latest album: "Midnights" • 2022`}),(0,p.jsx)(`p`,{children:`13 tracks • 44 minutes`})]})]})}},E={args:{artist:h,children:(0,p.jsxs)(`div`,{className:`space-y-6 w-full`,children:[(0,p.jsx)(r,{className:`w-full`,size:`lg`,children:`Listen Now`}),(0,p.jsxs)(`div`,{className:`grid grid-cols-3 gap-3`,children:[(0,p.jsx)(r,{variant:`outline`,size:`sm`,children:`Follow`}),(0,p.jsx)(r,{variant:`outline`,size:`sm`,children:`Share`}),(0,p.jsx)(r,{variant:`outline`,size:`sm`,children:`Tip`})]}),(0,p.jsx)(`div`,{className:`text-center space-y-2`,children:(0,p.jsxs)(`div`,{className:`flex justify-center space-x-4 text-sm text-gray-600 dark:text-gray-400`,children:[(0,p.jsx)(`span`,{children:`12.4M followers`}),(0,p.jsx)(`span`,{children:`•`}),(0,p.jsx)(`span`,{children:`85 releases`})]})})]})}},D=[`Default`,`WithSubtitle`,`WithActions`,`GlassVariant`,`SolidVariant`,`DotsBackground`,`GradientBackground`,`NoBackground`,`SmallProfile`,`LargeProfile`,`CompleteProfile`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    subtitle: 'Live at Madison Square Garden 2024'
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    children: <div className='space-y-4 w-full'>
        <Button className='w-full' size='lg'>
          Listen Now
        </Button>
        <div className='grid grid-cols-2 gap-3'>
          <Button variant='outline'>Follow</Button>
          <Button variant='outline'>Share</Button>
        </div>
      </div>
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    containerVariant: 'glass',
    children: <Button className='w-full' size='lg'>
        Listen Now
      </Button>
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    containerVariant: 'solid',
    children: <Button className='w-full' size='lg'>
        Listen Now
      </Button>
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    backgroundPattern: 'dots',
    children: <Button className='w-full' size='lg'>
        Listen Now
      </Button>
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    backgroundPattern: 'gradient',
    containerVariant: 'glass',
    children: <Button className='w-full' size='lg'>
        Listen Now
      </Button>
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    backgroundPattern: 'none',
    showGradientBlurs: false,
    containerVariant: 'solid',
    children: <Button className='w-full' size='lg'>
        Listen Now
      </Button>
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    avatarSize: 'sm',
    nameSize: 'sm',
    maxWidthClass: 'w-full max-w-xs',
    children: <Button className='w-full' size='sm'>
        Follow
      </Button>
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    avatarSize: 'xl',
    nameSize: 'xl',
    maxWidthClass: 'w-full max-w-lg',
    children: <div className='space-y-6 w-full'>
        <Button className='w-full' size='lg'>
          Listen Now
        </Button>
        <div className='text-center text-gray-600 dark:text-gray-400'>
          <p>Latest album: &quot;Midnights&quot; • 2022</p>
          <p>13 tracks • 44 minutes</p>
        </div>
      </div>
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    artist: mockArtist,
    children: <div className='space-y-6 w-full'>
        <Button className='w-full' size='lg'>
          Listen Now
        </Button>

        <div className='grid grid-cols-3 gap-3'>
          <Button variant='outline' size='sm'>
            Follow
          </Button>
          <Button variant='outline' size='sm'>
            Share
          </Button>
          <Button variant='outline' size='sm'>
            Tip
          </Button>
        </div>

        <div className='text-center space-y-2'>
          <div className='flex justify-center space-x-4 text-sm text-gray-600 dark:text-gray-400'>
            <span>12.4M followers</span>
            <span>•</span>
            <span>85 releases</span>
          </div>
        </div>
      </div>
  }
}`,...E.parameters?.docs?.source}}}})))()}O();export{E as CompleteProfile,g as Default,x as DotsBackground,y as GlassVariant,S as GradientBackground,T as LargeProfile,C as NoBackground,w as SmallProfile,b as SolidVariant,v as WithActions,_ as WithSubtitle,D as __namedExportsOrder,m as default};
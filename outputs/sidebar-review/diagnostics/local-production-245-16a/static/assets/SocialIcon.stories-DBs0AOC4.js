import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{r as n,t as r}from"./SocialIcon-B36VBlYO.js";var i,a,o,s,c,l,u;function d(){return(d=e((()=>{i=t(),n(),a={title:`Atoms/SocialIcon`,component:r,parameters:{layout:`centered`},args:{platform:`spotify`,size:24}},o=[[`spotify`,`Spotify`],[`apple_music`,`Apple Music`],[`youtube_music`,`YouTube Music`],[`amazon_music`,`Amazon Music`],[`soundcloud`,`SoundCloud`],[`tidal`,`Tidal`],[`deezer`,`Deezer`],[`netease_music`,`NetEase Music`],[`qq_music`,`QQ Music`]],s={},c={render:()=>(0,i.jsxs)(`fieldset`,{className:`grid grid-cols-3 gap-4`,children:[(0,i.jsx)(`legend`,{className:`sr-only`,children:`Music services`}),o.map(([e,t])=>(0,i.jsxs)(`div`,{className:`flex min-w-24 flex-col items-center gap-2 text-center text-sm text-secondary-token`,children:[(0,i.jsx)(r,{platform:e,size:24,"aria-hidden":!1,"aria-label":t}),(0,i.jsx)(`span`,{children:t})]},e))]})},l={args:{platform:`unknown-platform`,"aria-hidden":!1,"aria-label":`Unknown platform`}},u=[`Default`,`MusicServices`,`UnknownPlatform`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  render: () => <fieldset className='grid grid-cols-3 gap-4'>
      <legend className='sr-only'>Music services</legend>
      {MUSIC_PLATFORMS.map(([platform, label]) => <div className='flex min-w-24 flex-col items-center gap-2 text-center text-sm text-secondary-token' key={platform}>
          <SocialIcon platform={platform} size={24} aria-hidden={false} aria-label={label} />
          <span>{label}</span>
        </div>)}
    </fieldset>
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    platform: 'unknown-platform',
    'aria-hidden': false,
    'aria-label': 'Unknown platform'
  }
}`,...l.parameters?.docs?.source}}}})))()}d();export{s as Default,c as MusicServices,l as UnknownPlatform,u as __namedExportsOrder,a as default};
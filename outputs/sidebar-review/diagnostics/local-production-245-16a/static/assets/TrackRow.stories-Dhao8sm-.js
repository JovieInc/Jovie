import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./TrackRow-vIoNmxFK.js";function a(e,t=!1){return{key:e,url:`https://example.com/${e}/track-1`,source:`ingested`,updatedAt:`2026-01-01T00:00:00.000Z`,label:c[e].label,path:`/${e}/track-1`,isPrimary:t}}var o,s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{o=t(),r(),s=[`spotify`,`apple_music`,`youtube_music`],c={spotify:{label:`Spotify`,accent:`#1ED760`},apple_music:{label:`Apple Music`,accent:`#FA243C`},youtube:{label:`YouTube`,accent:`#FF0000`},youtube_music:{label:`YouTube Music`,accent:`#FF0000`},soundcloud:{label:`SoundCloud`,accent:`#FF7700`},deezer:{label:`Deezer`,accent:`#A238FF`},tidal:{label:`Tidal`,accent:`#000000`},amazon_music:{label:`Amazon Music`,accent:`#00A8E1`},bandcamp:{label:`Bandcamp`,accent:`#629AA9`},beatport:{label:`Beatport`,accent:`#01FF95`},pandora:{label:`Pandora`,accent:`#224099`},napster:{label:`Napster`,accent:`#000000`},audiomack:{label:`Audiomack`,accent:`#FFA200`},qobuz:{label:`Qobuz`,accent:`#000000`}},l={id:`track-1`,releaseId:`release-1`,releaseSlug:`skyline-dreams`,title:`Skyline Dreams`,slug:`skyline-dreams-track`,smartLinkPath:`/smart/release-1/track-1`,trackNumber:1,discNumber:1,durationMs:214e3,isrc:`US-ABC-26-00001`,isExplicit:!1,previewUrl:`https://cdn.example.com/preview.mp3`,audioUrl:`https://cdn.example.com/preview.mp3`,audioFormat:`mp3`,providers:[a(`spotify`,!0),a(`apple_music`)]},u={title:`Dashboard/Organisms/ReleaseProviderMatrix/TrackRow`,component:i,parameters:{layout:`padded`},args:{track:l,providerConfig:c,allProviders:s,columnCount:9}},d={render:e=>(0,o.jsx)(`table`,{className:`w-full`,children:(0,o.jsx)(`tbody`,{children:(0,o.jsx)(i,{...e})})})},f={args:{isSelected:!0,onClick:()=>{}},render:e=>(0,o.jsx)(`table`,{className:`w-full`,children:(0,o.jsx)(`tbody`,{children:(0,o.jsx)(i,{...e})})})},p={args:{renderMode:`stack`},render:e=>(0,o.jsx)(`div`,{className:`w-96`,children:(0,o.jsx)(i,{...e})})},m={args:{renderMode:`stack`,track:{...l,previewUrl:null,audioUrl:null}},render:e=>(0,o.jsx)(`div`,{className:`w-96`,children:(0,o.jsx)(i,{...e})})},h={args:{renderMode:`stack`,track:{...l,isExplicit:!0,providers:[]}},render:e=>(0,o.jsx)(`div`,{className:`w-96`,children:(0,o.jsx)(i,{...e})})},g={render:e=>(0,o.jsx)(`table`,{className:`w-full`,children:(0,o.jsx)(`tbody`,{children:(0,o.jsx)(n,{tracks:[e.track,{...e.track,id:`track-2`,trackNumber:2}],providerConfig:e.providerConfig,allProviders:e.allProviders,columnCount:e.columnCount})})})},_=[`Table`,`TableSelected`,`Stack`,`StackNoPreview`,`StackExplicitNoLinks`,`ExpandedRelease`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  render: args => <table className='w-full'>
      <tbody>
        <TrackRow {...args} />
      </tbody>
    </table>
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    isSelected: true,
    onClick: () => {}
  },
  render: args => <table className='w-full'>
      <tbody>
        <TrackRow {...args} />
      </tbody>
    </table>
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    renderMode: 'stack'
  },
  render: args => <div className='w-96'>
      <TrackRow {...args} />
    </div>
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    renderMode: 'stack',
    track: {
      ...track,
      previewUrl: null,
      audioUrl: null
    }
  },
  render: args => <div className='w-96'>
      <TrackRow {...args} />
    </div>
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    renderMode: 'stack',
    track: {
      ...track,
      isExplicit: true,
      providers: []
    }
  },
  render: args => <div className='w-96'>
      <TrackRow {...args} />
    </div>
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  render: args => <table className='w-full'>
      <tbody>
        <TrackRowsContainer tracks={[args.track, {
        ...args.track,
        id: 'track-2',
        trackNumber: 2
      }]} providerConfig={args.providerConfig} allProviders={args.allProviders} columnCount={args.columnCount} />
      </tbody>
    </table>
}`,...g.parameters?.docs?.source}}}})))()}v();export{g as ExpandedRelease,p as Stack,h as StackExplicitNoLinks,m as StackNoPreview,d as Table,f as TableSelected,_ as __namedExportsOrder,u as default};
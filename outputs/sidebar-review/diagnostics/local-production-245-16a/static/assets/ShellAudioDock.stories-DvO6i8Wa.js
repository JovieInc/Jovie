import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./AudioBar-BmxEitpe.js";import{n as a,r as o}from"./next-themes-mock-BTTZ5A_l.js";import{i as s,r as c,t as l}from"./audio-chrome-state-CYxsamkV.js";import{n as u,t as d}from"./ShellAudioDock-TfvAgo1j.js";import{n as f,t as p}from"./SidebarNowPlaying-Bk6l6yjg.js";function m({isPlaying:e}){return(0,g.jsxs)(`div`,{className:`flex items-center gap-3 px-4 py-1.5`,children:[(0,g.jsx)(p,{track:{trackTitle:b.title,artistName:b.artist,artworkUrl:`https://placehold.co/640x640/111827/E5E7EB?text=Artwork`},isPlaying:e,onPlay:()=>void 0,playOverlayVisible:!1,className:`w-56 shrink-0 border-0 bg-transparent px-1 py-1 shadow-none`}),(0,g.jsx)(i,{isPlaying:e,onPlay:()=>void 0,onPrevious:()=>void 0,onNext:()=>void 0,currentTime:42,duration:213,waveformOn:!1,onToggleWaveform:()=>void 0,track:b,className:`min-w-0 flex-1 px-0 py-0`})]})}function h({chromeState:e,theme:t,rightRail:n}){let{setTheme:r}=o();return(0,_.useEffect)(()=>{r(t)},[r,t]),(0,_.useEffect)(()=>(e===`hidden`?c():s({activeTrackId:b.id,compactPlayerVisible:!1,fullPlayerVisible:!0}),()=>c()),[e]),(0,g.jsxs)(`div`,{className:`flex gap-2 bg-base p-2`,style:{height:420,width:720},children:[(0,g.jsxs)(`div`,{className:`flex min-w-0 flex-1 flex-col`,children:[(0,g.jsxs)(`div`,{className:`flex min-h-0 flex-1 flex-col overflow-hidden rounded-(--app-shell-radius) bg-(--app-shell-content-surface) shadow-(--app-shell-shadow)`,children:[(0,g.jsx)(`div`,{className:`border-subtle border-b px-4 py-2 text-xs text-tertiary-token`,children:`Header`}),(0,g.jsx)(`div`,{className:`flex-1 p-4 text-xs text-quaternary-token`,children:`Main content — nothing here shifts horizontally or reflows when the dock opens; only the panel’s height animates.`})]}),(0,g.jsx)(d,{children:(0,g.jsx)(m,{isPlaying:e===`playing`})})]}),n?(0,g.jsx)(`aside`,{"aria-label":`Context Panel`,className:`w-40 shrink-0 rounded-(--app-shell-radius) bg-(--app-shell-content-surface) p-3 text-xs text-tertiary-token shadow-(--app-shell-shadow)`,children:`Right rail — spans the full column height above the dock (L3 over L1).`}):null]})}var g,_,v,y,b,x,S,C,w,T,E,D,O,k;function A(){return(A=e((()=>{g=n(),a(),_=t(),l(),r(),u(),f(),{expect:v,waitFor:y}=__STORYBOOK_MODULE_TEST__,b={id:`bahamas-lost-light`,title:`Lost in the Light`,artist:`Bahamas`,hasLyrics:!0,bpm:118,musicalKey:`8A`},x={title:`Shell/ShellAudioDock`,component:h,parameters:{layout:`fullscreen`},args:{chromeState:`hidden`,theme:`dark`,rightRail:!1},argTypes:{chromeState:{control:`radio`,options:[`hidden`,`playing`,`paused`]},theme:{control:`radio`,options:[`light`,`dark`]}}},S={},C={args:{chromeState:`playing`}},w={args:{chromeState:`paused`}},T={args:{chromeState:`hidden`},play:async()=>{s({activeTrackId:b.id,compactPlayerVisible:!1,fullPlayerVisible:!0});let e=document.querySelector(`[data-shell-audio-dock]`);await y(()=>v(e).toHaveAttribute(`data-state`,`open`))}},E={args:{chromeState:`playing`,rightRail:!0}},D={args:{chromeState:`playing`,theme:`light`}},O={args:{chromeState:`playing`,rightRail:!0,theme:`light`}},k=[`Hidden`,`Playing`,`Paused`,`Revealing`,`WithRightRail`,`PlayingLight`,`WithRightRailLight`],S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    chromeState: 'playing'
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    chromeState: 'paused'
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    chromeState: 'hidden'
  },
  play: async () => {
    setAudioChromeSnapshot({
      activeTrackId: DOCK_TRACK.id,
      compactPlayerVisible: false,
      fullPlayerVisible: true
    });
    const dock = document.querySelector('[data-shell-audio-dock]');
    await waitFor(() => expect(dock).toHaveAttribute('data-state', 'open'));
  }
}`,...T.parameters?.docs?.source},description:{story:`Fires the idle → playing transition after mount so the cinematic reveal
 animates in view.`,...T.parameters?.docs?.description}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    chromeState: 'playing',
    rightRail: true
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    chromeState: 'playing',
    theme: 'light'
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    chromeState: 'playing',
    rightRail: true,
    theme: 'light'
  }
}`,...O.parameters?.docs?.source}}}})))()}A();export{S as Hidden,w as Paused,C as Playing,D as PlayingLight,T as Revealing,E as WithRightRail,O as WithRightRailLight,k as __namedExportsOrder,x as default};
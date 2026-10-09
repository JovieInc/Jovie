import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,r as n}from"./DesktopUpdateModal-BufLEFme.js";var r,i,a,o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{n(),r={state:`available`,version:`26.9.16`,releaseDate:`2026-09-27T00:00:00.000Z`,notesUrl:`https://jov.ie/changelog`},i={title:`Organisms/DesktopUpdateModal`,component:t,parameters:{layout:`centered`},args:{open:!0,onDownload:()=>void 0,onInstall:()=>void 0,onRetry:()=>void 0,onLater:()=>void 0,notes:{summary:`Faster release sync and a calmer sidebar.`,items:[`Release cards now sync in the background`,`New audio dock`]},loading:!1}},a={args:{state:r}},o={args:{state:r,notes:null,loading:!0}},s={args:{state:r,notes:null}},c={args:{state:{state:`downloading`,percent:42,transferredBytes:100663296,totalBytes:240123904,bytesPerSecond:14680064},version:`26.9.16`}},l={args:{state:{state:`downloading`,percent:25,transferredBytes:131072,totalBytes:524288,bytesPerSecond:32768},version:`26.9.16`}},u={args:{state:{state:`ready`,version:`26.9.16`}}},d={args:{state:{state:`error`,message:`net::ERR_CONNECTION_REFUSED`,retryable:!0}}},f={args:{state:{state:`error`,message:`code signature mismatch`,retryable:!1}}},p={args:{state:r,notes:{summary:`Touch ID sign-in, a steadier release pipeline and table fixes.`,items:Array.from({length:14},(e,t)=>`Release note line ${t+1} with enough words to wrap once`)}}},m={...a,parameters:{themes:{themeOverride:`light`}}},h={...u,parameters:{themes:{themeOverride:`light`}}},g=[`Available`,`AvailableLoadingNotes`,`AvailableFallbackLink`,`Downloading`,`DownloadingSlow`,`Ready`,`ErrorState`,`ErrorNotRetryable`,`AvailableLongNotes`,`AvailableLight`,`ReadyLight`],a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{
  args: {
    state: AVAILABLE
  }
}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    state: AVAILABLE,
    notes: null,
    loading: true
  }
}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    state: AVAILABLE,
    notes: null
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'downloading',
      percent: 42,
      transferredBytes: 96 * 1024 * 1024,
      totalBytes: 229 * 1024 * 1024,
      bytesPerSecond: 14 * 1024 * 1024
    },
    version: '26.9.16'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'downloading',
      percent: 25,
      transferredBytes: 128 * 1024,
      totalBytes: 512 * 1024,
      bytesPerSecond: 32 * 1024
    },
    version: '26.9.16'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'ready',
      version: '26.9.16'
    }
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'error',
      message: 'net::ERR_CONNECTION_REFUSED',
      retryable: true
    }
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    state: {
      state: 'error',
      message: 'code signature mismatch',
      retryable: false
    }
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    state: AVAILABLE,
    notes: {
      summary: 'Touch ID sign-in, a steadier release pipeline and table fixes.',
      items: Array.from({
        length: 14
      }, (_, i) => \`Release note line \${i + 1} with enough words to wrap once\`)
    }
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  ...Available,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  ...Ready,
  parameters: {
    themes: {
      themeOverride: 'light'
    }
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{a as Available,s as AvailableFallbackLink,m as AvailableLight,o as AvailableLoadingNotes,p as AvailableLongNotes,c as Downloading,l as DownloadingSlow,f as ErrorNotRetryable,d as ErrorState,u as Ready,h as ReadyLight,g as __namedExportsOrder,i as default};
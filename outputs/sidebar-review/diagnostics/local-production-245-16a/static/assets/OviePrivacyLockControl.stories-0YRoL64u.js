import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./OviePrivacyLockControl-CD59dQYw.js";function a({initialState:e,readiness:t}){return(0,s.useLayoutEffect)(()=>{let t=globalThis.fetch;return globalThis.fetch=async(t,n)=>{if(String(t).includes(`/api/ovie/privacy-lock`))return!n?.method||n.method===`GET`?new Response(JSON.stringify(e),{status:200,headers:{"Content-Type":`application/json`}}):new Response(JSON.stringify({error:`Stories never mutate privacy settings.`}),{status:503,headers:{"Content-Type":`application/json`}});throw Error(`Unexpected network request in privacy-lock story.`)},()=>{globalThis.fetch=t}},[e]),(0,o.jsx)(`div`,{className:`w-80 rounded-lg border border-subtle bg-surface-1 p-1 shadow-lg`,children:(0,o.jsx)(i,{ensurePrivacyLockCanBeEnabled:t})})}var o,s,c,l,u,d,f,p,m,h,g,_,v,y,b,x;function S(){return(S=e((()=>{o=n(),s=t(),r(),{expect:c,userEvent:l,within:u}=__STORYBOOK_MODULE_TEST__,d={enabled:!1,locked:!1,unlockedUntil:null},f={enabled:!0,locked:!1,unlockedUntil:new Date(Date.now()+828e5).toISOString()},p={enabled:!0,locked:!0,unlockedUntil:null},m=`This Jovie app cannot show the passkey prompt yet. Open Jovie in your browser to unlock.`,h={title:`Organisms/UserButton/OviePrivacyLockControl`,component:a,parameters:{layout:`centered`,docs:{story:{inline:!1,height:`180px`},description:{component:`Ovie-only privacy setting. Stories use a local state endpoint and never complete passkey ceremonies or change account settings.`}}},args:{initialState:d,readiness:async()=>{}}},g={play:async({canvasElement:e})=>{let t=u(e);await c(await t.findByRole(`button`,{name:`Enable Ovie privacy lock`})).toBeEnabled()}},_={args:{initialState:f},play:async({canvasElement:e})=>{let t=u(e);await c(await t.findByText(`On · unlocked for up to 24 hours`)).toBeInTheDocument(),await c(t.getByRole(`button`,{name:`Turn off Ovie privacy lock`})).toBeInTheDocument(),await c(t.getByRole(`button`,{name:`Lock Ovie Now`})).toBeInTheDocument()}},v={args:{initialState:p},play:async({canvasElement:e})=>{let t=u(e);await t.findByText(`Ovie is locked`),await t.findByText(`Unlock with your passkey to continue.`),await c(t.queryByRole(`button`)).not.toBeInTheDocument()}},y={play:async({canvasElement:e})=>{let t=u(e);await t.findByRole(`button`,{name:`Enable Ovie privacy lock`}),await l.click(t.getByRole(`button`,{name:`Enable Ovie privacy lock`})),await c(await t.findByRole(`button`,{name:`Updating…`})).toBeDisabled()},args:{readiness:()=>new Promise(()=>void 0)}},b={play:async({canvasElement:e})=>{let t=u(e);await t.findByRole(`button`,{name:`Enable Ovie privacy lock`}),await l.click(t.getByRole(`button`,{name:`Enable Ovie privacy lock`})),await c(await t.findByRole(`alert`)).toHaveTextContent(m),await t.findByRole(`button`,{name:`Enable Ovie privacy lock`})},args:{readiness:async()=>{throw Error(m)}}},x=[`Off`,`OnUnlocked`,`Locked`,`PendingEnable`,`UnsupportedRuntime`],g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', {
      name: 'Enable Ovie privacy lock'
    })).toBeEnabled();
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    initialState: ON_UNLOCKED
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('On · unlocked for up to 24 hours')).toBeInTheDocument();
    await expect(canvas.getByRole('button', {
      name: 'Turn off Ovie privacy lock'
    })).toBeInTheDocument();
    await expect(canvas.getByRole('button', {
      name: 'Lock Ovie Now'
    })).toBeInTheDocument();
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    initialState: ON_LOCKED
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Ovie is locked');
    await canvas.findByText('Unlock with your passkey to continue.');
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', {
      name: 'Enable Ovie privacy lock'
    });
    await userEvent.click(canvas.getByRole('button', {
      name: 'Enable Ovie privacy lock'
    }));
    await expect(await canvas.findByRole('button', {
      name: 'Updating…'
    })).toBeDisabled();
  },
  args: {
    readiness: () => new Promise<void>(() => undefined)
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', {
      name: 'Enable Ovie privacy lock'
    });
    await userEvent.click(canvas.getByRole('button', {
      name: 'Enable Ovie privacy lock'
    }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(UNSUPPORTED_DESKTOP_MESSAGE);
    await canvas.findByRole('button', {
      name: 'Enable Ovie privacy lock'
    });
  },
  args: {
    readiness: async () => {
      throw new Error(UNSUPPORTED_DESKTOP_MESSAGE);
    }
  }
}`,...b.parameters?.docs?.source}}}})))()}S();export{v as Locked,g as Off,_ as OnUnlocked,y as PendingEnable,b as UnsupportedRuntime,x as __namedExportsOrder,h as default};
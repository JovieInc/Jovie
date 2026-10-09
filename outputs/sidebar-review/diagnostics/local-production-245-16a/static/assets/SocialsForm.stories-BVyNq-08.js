import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./SocialsForm-D8vwZyWj.js";var i,a,o,s,c,l,u,d,f,p,m,h,g,_;function v(){return(v=e((()=>{i=t(),n(),a={id:`mock-artist-id`,owner_user_id:`mock-user-id`,handle:`artisthandle`,spotify_id:`mock-spotify-id`,name:`Mock Artist`,image_url:`https://example.com/avatar.jpg`,tagline:`Mock artist tagline`,published:!0,is_verified:!0,is_featured:!1,marketing_opt_out:!1,created_at:`2023-01-01T00:00:00Z`},o=[{id:`link-1`,platform:`instagram`,url:`https://instagram.com/artisthandle`},{id:`link-2`,platform:`twitter`,url:`https://twitter.com/artisthandle`},{id:`link-3`,platform:`youtube`,url:`https://youtube.com/@artisthandle`}],s=[],c=[{id:`link-1`,platform:`instagram`,url:`invalid-url`}],l={title:`Dashboard/Organisms/SocialsForm`,component:r,parameters:{layout:`padded`,backgrounds:{default:`light`,values:[{name:`light`,value:`#ffffff`},{name:`dark`,value:`#1a1a1a`}]},a11y:{config:{rules:[{id:`color-contrast`,enabled:!0}]}}},tags:[`autodocs`],decorators:[e=>(0,i.jsx)(`div`,{className:`max-w-3xl mx-auto p-6 border border-gray-200 dark:border-gray-800 rounded-lg`,children:(0,i.jsx)(e,{})})]},u=(e,t=[],n=!1)=>{let r=globalThis.fetch;globalThis.fetch=(e,i)=>{let a=typeof e==`string`?e:e.toString();return a.includes(`/api/dashboard/social-links`)&&(!i||i.method===void 0)?Promise.resolve(new Response(JSON.stringify({links:t}),{status:200})):a.includes(`/api/dashboard/social-links`)&&i?.method===`PUT`?n?Promise.resolve(new Response(JSON.stringify({error:`Validation error`}),{status:400})):Promise.resolve(new Response(`{}`,{status:200})):r(e,i)};let a=(0,i.jsx)(e,{});return globalThis.fetch=r,a},d={decorators:[e=>u(e,s)],args:{artist:a}},f={decorators:[e=>u(e,o)],args:{artist:a}},p={decorators:[e=>u(e,c,!0)],args:{artist:a}},m={parameters:{backgrounds:{default:`dark`}},decorators:[e=>(0,i.jsx)(`div`,{className:`dark`,children:u(e,o)})],args:{artist:a}},h={decorators:[e=>{let t=globalThis.fetch;globalThis.fetch=(e,n)=>(typeof e==`string`?e:e.toString()).includes(`/api/dashboard/social-links`)&&(!n||n.method===void 0)?new Promise(()=>{}):t(e,n);let n=(0,i.jsx)(e,{});return globalThis.fetch=t,n}],args:{artist:a}},g={decorators:[e=>{let t=globalThis.fetch;globalThis.fetch=(e,n)=>{let r=typeof e==`string`?e:e.toString();return r.includes(`/api/dashboard/social-links`)&&(!n||n.method===void 0)?Promise.resolve(new Response(JSON.stringify({links:o}),{status:200})):r.includes(`/api/dashboard/social-links`)&&n?.method===`PUT`?Promise.resolve(new Response(`{}`,{status:200})):t(e,n)};let n=(0,i.jsx)(e,{});return globalThis.fetch=t,n}],args:{artist:a}},_=[`Default`,`Prefilled`,`ValidationError`,`DarkMode`,`Loading`,`SuccessMessage`],d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  decorators: [Story => withFetchMock(Story, mockEmptySocialLinks)],
  args: {
    artist: mockArtist
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  decorators: [Story => withFetchMock(Story, mockSocialLinks)],
  args: {
    artist: mockArtist
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  decorators: [Story => withFetchMock(Story, mockInvalidSocialLinks, true)],
  args: {
    artist: mockArtist
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  },
  decorators: [Story => <div className='dark'>{withFetchMock(Story, mockSocialLinks)}</div>],
  args: {
    artist: mockArtist
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  decorators: [Story => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/dashboard/social-links') && (!init || init.method === undefined)) {
        // GET that never resolves
        return new Promise<Response>(() => {}) as unknown as ReturnType<typeof fetch>;
      }
      return originalFetch!(input as RequestInfo, init);
    }) as typeof fetch;
    const result = <Story />;
    globalThis.fetch = originalFetch!;
    return result;
  }],
  args: {
    artist: mockArtist
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  decorators: [Story => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/dashboard/social-links') && (!init || init.method === undefined)) {
        // GET
        return Promise.resolve(new Response(JSON.stringify({
          links: mockSocialLinks
        }), {
          status: 200
        }));
      }
      if (url.includes('/api/dashboard/social-links') && init?.method === 'PUT') {
        return Promise.resolve(new Response('{}', {
          status: 200
        }));
      }
      return originalFetch!(input as RequestInfo, init);
    }) as typeof fetch;

    // Render the story
    const result = <Story />;

    // Restore the original implementations after rendering
    globalThis.fetch = originalFetch!;
    return result;
  }],
  args: {
    artist: mockArtist
  }
}`,...g.parameters?.docs?.source}}}})))()}v();export{m as DarkMode,d as Default,h as Loading,f as Prefilled,g as SuccessMessage,p as ValidationError,_ as __namedExportsOrder,l as default};
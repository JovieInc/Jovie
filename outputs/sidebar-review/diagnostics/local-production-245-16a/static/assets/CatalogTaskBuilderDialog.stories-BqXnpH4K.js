import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{r as t,t as n}from"./CatalogTaskBuilderDialog-DblOvhX2.js";var r,i,a,o,s,c,l,u,d,f;function p(){return(p=e((()=>{t(),{expect:r,fn:i,userEvent:a,within:o}=__STORYBOOK_MODULE_TEST__,s={title:`Dashboard/Releases/CatalogTaskBuilderDialog`,component:n,parameters:{layout:`fullscreen`},args:{open:!0,releaseId:`release-story`,catalog:[{slug:`spotify-editorial-pitch`,name:`Pitch Spotify editorial`,shortDescription:`Submit via Spotify for Artists.`,clusterId:1,category:`editorial`},{slug:`amazon-editorial-pitch`,name:`Pitch Amazon Music editorial`,shortDescription:`Submit via Amazon Music for Artists.`,clusterId:1,category:`editorial`},{slug:`dj-promo-pool-bpm-supreme`,name:`DJ promo pool submission`,shortDescription:`BPM Supreme / DJcity.`,clusterId:2,category:`dj`}],clusters:[{id:1,slug:`editorial-pitching`,displayName:`Editorial Pitching`},{id:2,slug:`dj-promotion`,displayName:`DJ Promotion`}],alreadyAddedSlugs:[],onClose:i(),onAdded:i(),addAction:i(async()=>void 0)}},c={},l={play:async({canvasElement:e})=>{let t=o(e.ownerDocument.body),n=await t.findByRole(`searchbox`,{name:`Search Tasks`});await a.type(n,`Amazon`),await r(n).toHaveValue(`Amazon`),await r(t.getByText(`Pitch Amazon Music editorial`)).toBeInTheDocument(),await r(t.queryByText(`Pitch Spotify editorial`)).not.toBeInTheDocument()}},u={play:async({canvasElement:e})=>{let t=o(e.ownerDocument.body),n=await t.findByRole(`searchbox`,{name:`Search Tasks`});await a.type(n,`No matching task`),await r(t.getByText(`No catalog tasks match that search.`)).toBeInTheDocument()}},d={args:{alreadyAddedSlugs:[`spotify-editorial-pitch`]}},f=[`Populated`,`Filtered`,`NoResults`,`AlreadyAdded`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const page = within(canvasElement.ownerDocument.body);
    const search = await page.findByRole('searchbox', {
      name: 'Search Tasks'
    });
    await userEvent.type(search, 'Amazon');
    await expect(search).toHaveValue('Amazon');
    await expect(page.getByText('Pitch Amazon Music editorial')).toBeInTheDocument();
    await expect(page.queryByText('Pitch Spotify editorial')).not.toBeInTheDocument();
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const page = within(canvasElement.ownerDocument.body);
    const search = await page.findByRole('searchbox', {
      name: 'Search Tasks'
    });
    await userEvent.type(search, 'No matching task');
    await expect(page.getByText('No catalog tasks match that search.')).toBeInTheDocument();
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    alreadyAddedSlugs: ['spotify-editorial-pitch']
  }
}`,...d.parameters?.docs?.source}}}})))()}p();export{d as AlreadyAdded,l as Filtered,u as NoResults,c as Populated,f as __namedExportsOrder,s as default};
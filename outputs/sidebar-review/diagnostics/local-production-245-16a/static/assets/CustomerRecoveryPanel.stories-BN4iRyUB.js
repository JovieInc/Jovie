import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./search-Binh2gA_.js";import{r as i,t as a}from"./badge-DqMNX1OQ.js";import{n as o,t as s}from"./input-BYNkmjMu.js";import{n as c,t as l}from"./link-e-necIhk.js";import{s as u,u as d}from"./admin-navigation-Ca8qE3QF.js";import{r as f,t as p}from"./ContentSurfaceCard-NsoaLSLh.js";import{n as m,t as h}from"./RerunIngestionButton-_YUzJRRM.js";function g({label:e,value:t}){return(0,b.jsxs)(`div`,{className:`min-w-0`,children:[(0,b.jsx)(`dt`,{className:`text-app text-tertiary-token`,children:e}),(0,b.jsx)(`dd`,{className:`text-app truncate font-medium text-primary-token`,children:t??`—`})]})}function _({title:e,children:t}){return(0,b.jsx)(p,{surface:`nested`,children:(0,b.jsxs)(`div`,{className:`space-y-3 p-4`,children:[(0,b.jsx)(`h3`,{className:`text-app font-semibold text-secondary-token`,children:e}),t]})})}function v({dossier:e}){let{identity:t,account:n,authority:r,admission:i,blocker:o}=e;return(0,b.jsxs)(`div`,{className:`grid gap-3 lg:grid-cols-2`,"data-testid":`customer-recovery-dossier`,children:[(0,b.jsxs)(_,{title:`Identity`,children:[(0,b.jsxs)(`dl`,{className:`grid grid-cols-2 gap-3`,children:[(0,b.jsx)(g,{label:`Name`,value:t.displayName}),(0,b.jsx)(g,{label:`Email`,value:t.email}),(0,b.jsx)(g,{label:`Handle`,value:t.handle}),(0,b.jsx)(g,{label:`Stage`,value:t.stage}),(0,b.jsx)(g,{label:`User`,value:t.userId}),(0,b.jsx)(g,{label:`Creator Profile`,value:t.creatorProfileId}),(0,b.jsx)(g,{label:`Lead`,value:t.leadId}),(0,b.jsx)(g,{label:`Waitlist Entry`,value:t.waitlistEntryId})]}),(0,b.jsx)(`div`,{className:`flex flex-wrap gap-1`,children:t.sources.map(e=>(0,b.jsx)(a,{variant:`secondary`,children:e},e))})]}),(0,b.jsx)(_,{title:`Account and admission`,children:(0,b.jsxs)(`dl`,{className:`grid grid-cols-2 gap-3`,children:[(0,b.jsx)(g,{label:`Plan`,value:n?`${n.plan??`free`}${n.isPro?` (pro flag)`:``}`:`no account`}),(0,b.jsx)(g,{label:`Paying`,value:n?n.isPaying?`yes`:`no`:`—`}),(0,b.jsx)(g,{label:`User Status`,value:n?.userStatus}),(0,b.jsx)(g,{label:`Admission`,value:i?i.status:`not on waitlist`}),(0,b.jsx)(g,{label:`Approved`,value:i?.approvedAt}),(0,b.jsx)(g,{label:`Signed Up`,value:i?.signedUpAt})]})}),(0,b.jsx)(_,{title:`Authority and connections`,children:(0,b.jsxs)(`dl`,{className:`grid grid-cols-2 gap-3`,children:[(0,b.jsx)(g,{label:`Artist-managed`,value:r?r.profileClaimed?`yes`:`no`:`—`}),(0,b.jsx)(g,{label:`Claimed At`,value:r?.claimedAt}),(0,b.jsx)(g,{label:`Verified`,value:r?r.isVerified?`yes`:`no`:`—`}),(0,b.jsx)(g,{label:`Social Links`,value:String(e.connections.activeSocialLinks)}),(0,b.jsx)(g,{label:`Releases`,value:e.launch?String(e.launch.releaseCount):`—`}),(0,b.jsx)(g,{label:`Latest Release`,value:e.launch?.latestReleaseTitle})]})}),(0,b.jsxs)(_,{title:`Blocker and next action`,children:[(0,b.jsx)(`p`,{className:`text-app text-primary-token`,children:o.summary}),r&&(0,b.jsxs)(`dl`,{className:`grid grid-cols-2 gap-3`,children:[(0,b.jsx)(g,{label:`Ingestion Status`,value:r.ingestionStatus}),(0,b.jsx)(g,{label:`Last Error`,value:r.lastIngestionError})]}),o.operation===`rerun-ingestion`&&t.creatorProfileId&&(0,b.jsx)(h,{creatorProfileId:t.creatorProfileId}),o.preconditionNote&&(0,b.jsx)(`p`,{className:`text-app text-secondary-token`,children:o.preconditionNote})]}),(0,b.jsx)(_,{title:`Recent operations`,children:e.recentOperations.length===0?(0,b.jsx)(`p`,{className:`text-app text-secondary-token`,children:`No ingest operations recorded for this customer.`}):(0,b.jsx)(`ul`,{className:`space-y-1`,children:e.recentOperations.map(e=>(0,b.jsxs)(`li`,{className:`text-app flex items-center justify-between gap-2 text-secondary-token`,children:[(0,b.jsxs)(`span`,{className:`truncate`,children:[e.type,e.failureReason?` — ${e.failureReason}`:``]}),(0,b.jsxs)(`span`,{className:`shrink-0 tabular-nums`,children:[e.result??`—`,` · `,e.createdAt.slice(0,10)]})]},`${e.type}-${e.createdAt}`))})})]})}function y({result:e}){return(0,b.jsxs)(`div`,{className:`space-y-4`,"data-testid":`customer-recovery-panel`,children:[(0,b.jsxs)(`form`,{method:`get`,className:`flex items-center gap-2`,"data-testid":`customer-recovery-search`,children:[(0,b.jsx)(`input`,{type:`hidden`,name:`view`,value:`recovery`}),(0,b.jsx)(s,{name:`q`,defaultValue:e.search,placeholder:`Search email, handle, or linked ID…`,"aria-label":`Customer Identifier`,autoComplete:`off`,className:`max-w-sm`}),(0,b.jsxs)(`button`,{type:`submit`,className:`inline-flex items-center gap-1 text-app text-secondary-token hover:text-primary-token`,children:[(0,b.jsx)(r,{className:`h-4 w-4`,"aria-hidden":!0}),` Search`]})]}),e.matches.length>1&&(0,b.jsxs)(`div`,{className:`space-y-1`,"data-testid":`customer-recovery-matches`,children:[(0,b.jsx)(`p`,{className:`text-app text-tertiary-token`,children:`Select the linked customer:`}),(0,b.jsx)(`ul`,{className:`space-y-1`,children:e.matches.map(t=>(0,b.jsx)(`li`,{children:(0,b.jsxs)(c,{href:u(`recovery`,new URLSearchParams({q:e.search,key:t.dedupeKey})),className:`text-app text-secondary-token underline-offset-2 hover:underline`,children:[t.displayName??t.email??t.handle??`Unknown`,` `,(0,b.jsxs)(`span`,{className:`text-tertiary-token`,children:[`(`,t.stage,t.email?` · ${t.email}`:``,`)`]})]})},t.dedupeKey))})]}),e.error===`unavailable`&&(0,b.jsx)(`p`,{className:`text-app text-secondary-token`,role:`status`,"data-testid":`customer-recovery-error`,children:`Customer recovery evidence is temporarily unavailable. Try the search again.`}),!e.error&&e.search&&e.matches.length===0&&(0,b.jsxs)(`p`,{className:`text-app text-secondary-token`,children:[`No canonical customer matches “`,e.search,`”.`]}),e.dossier&&(0,b.jsx)(v,{dossier:e.dossier}),(0,b.jsxs)(`p`,{className:`text-app text-tertiary-token`,children:[`Evidence snapshot generated `,e.generatedAt,`. Recovery state is confirmed by reading this dossier back after an action — the button receipt marks “requested”, not recovered.`]})]})}var b;function x(){return(x=e((()=>{b=t(),i(),o(),n(),l(),f(),d(),m()})))()}var S,C,w,T,E,D,O,k,A,j;function M(){return(M=e((()=>{S=t(),x(),C={identity:{dedupeKey:`user:u1`,displayName:`Phoebe Bridgers`,email:`phoebe@example.com`,handle:`phoebe`,stage:`claimed`,overrideStage:null,sources:[`waitlist`,`creator_profile`],certifiedAt:null,activityAt:null,userId:`u1`,creatorProfileId:`cp1`,leadId:null,waitlistEntryId:`w1`},account:{userStatus:`active`,plan:`pro`,isPro:!0,isPaying:!0,deletedAt:null},authority:{profileClaimed:!0,claimedAt:`2026-09-01T00:00:00.000Z`,isVerified:!1,ingestionStatus:`failed`,lastIngestionError:`spotify timeout`,hasSpotifySource:!0},admission:{status:`approved`,approvedAt:`2026-08-01T00:00:00.000Z`,invitedAt:null,signedUpAt:`2026-08-02T00:00:00.000Z`},connections:{activeSocialLinks:4},launch:{releaseCount:3,latestReleaseTitle:`Punisher`},recentOperations:[{type:`artist-ingest`,result:`failed`,failureReason:`spotify timeout`,createdAt:`2026-09-15T00:00:00.000Z`}],blocker:{kind:`ingestion-failed`,summary:`Artist ingestion failed and can be re-run.`,operation:`rerun-ingestion`,preconditionNote:null}},w={search:`phoebe`,matches:[],dossier:C,error:null,generatedAt:`2026-10-02T12:00:00.000Z`},T={title:`Features/Admin/CustomerRecovery/CustomerRecoveryPanel`,component:y,parameters:{layout:`fullscreen`},decorators:[e=>(0,S.jsx)(`div`,{className:`min-h-screen bg-surface-0 p-6 text-primary-token`,children:(0,S.jsx)(e,{})})],args:{result:w}},E={},D={args:{result:{...w,dossier:null,matches:[{dedupeKey:`user:u1`,displayName:`Phoebe Bridgers`,email:`phoebe@example.com`,handle:`phoebe`,stage:`claimed`},{dedupeKey:`lead:l2`,displayName:null,email:`p.b@example.com`,handle:null,stage:`suggested`}]}}},O={args:{result:{...w,dossier:null,matches:[]}}},k={args:{result:{...w,dossier:null,matches:[],error:`unavailable`}}},A={args:{result:{...w,dossier:{...C,blocker:{kind:`ingestion-in-flight`,summary:`An ingestion run is already in flight.`,operation:null,preconditionNote:`Wait for the current run to finish.`}}}}},j=[`Dossier`,`AmbiguousMatches`,`NoMatches`,`Unavailable`,`ReadOnlyBlocker`],E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    result: {
      ...baseResult,
      dossier: null,
      matches: [{
        dedupeKey: 'user:u1',
        displayName: 'Phoebe Bridgers',
        email: 'phoebe@example.com',
        handle: 'phoebe',
        stage: 'claimed'
      }, {
        dedupeKey: 'lead:l2',
        displayName: null,
        email: 'p.b@example.com',
        handle: null,
        stage: 'suggested'
      }]
    }
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    result: {
      ...baseResult,
      dossier: null,
      matches: []
    }
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    result: {
      ...baseResult,
      dossier: null,
      matches: [],
      error: 'unavailable'
    }
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    result: {
      ...baseResult,
      dossier: {
        ...dossier,
        blocker: {
          kind: 'ingestion-in-flight',
          summary: 'An ingestion run is already in flight.',
          operation: null,
          preconditionNote: 'Wait for the current run to finish.'
        }
      }
    }
  }
}`,...A.parameters?.docs?.source}}}})))()}M();export{D as AmbiguousMatches,E as Dossier,O as NoMatches,A as ReadOnlyBlocker,k as Unavailable,j as __namedExportsOrder,T as default};
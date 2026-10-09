import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,n as r,r as i,t as a}from"./types-D3M7_afG.js";import{n as o,r as s}from"./TableMetaContext-Du8JfX5-.js";import{n as c,r as l}from"./dashboard-fixtures-Dl8rldOO.js";function u(e){let t=[];for(let n=0;n<e;n++){let e=y[n%y.length],r=b[n%b.length],i=x[n*7%x.length],a=[`high`,`medium`,`low`][n%3],o=[`email`,`sms`,`anonymous`,`spotify`][n%4],s=[`mobile`,`desktop`,`tablet`][n%3],c=n%4+1,l=Array.from({length:c},(e,t)=>({label:S[(n+t)%S.length],timestamp:new Date(Date.now()-t*864e5).toISOString()})),u=n%3,d=[`https://instagram.com`,`https://tiktok.com`,`https://youtube.com`,`https://twitter.com`,`https://facebook.com`],f=Array.from({length:u},(e,t)=>({url:d[(n+t)%d.length],timestamp:new Date(Date.now()-t*864e5*7).toISOString()})),p=o===`anonymous`,m=p?null:`${r} ${i}`,h=o===`email`||o===`spotify`?`${r.toLowerCase()}.${i.toLowerCase()}${n}@example.com`:null,g=o===`sms`?`+1555${String(n).padStart(7,`0`)}`:null;t.push({id:`aud-virt-${n}`,type:o,displayName:m,locationLabel:p?`Unknown`:`${e.city}, ${e.country}`,geoCity:p?null:e.city,geoCountry:p?null:e.country,visits:Math.floor(n*17%100)+1,engagementScore:Math.floor(n*23%100),intentLevel:a,latestActions:l,referrerHistory:f,utmParams:{},email:h,phone:g,spotifyConnected:o===`spotify`,purchaseCount:Math.floor(n*3%5),tipAmountTotalCents:Math.floor(n*137%5e3),tipCount:Math.floor(n*3%5),tags:n%5==0?[`superfan`]:n%7==0?[`vip`]:[],deviceType:s,lastSeenAt:new Date(Date.now()-n%30*864e5).toISOString()})}return t}var d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D;function O(){return(O=e((()=>{d=t(),l(),s(),n(),r(),f={user:{id:`story-user`},creatorProfiles:[],selectedProfile:null,needsOnboarding:!1,sidebarCollapsed:!1,hasSocialLinks:!0,hasMusicLinks:!1,isAdmin:!1,tippingStats:{tipClicks:0,qrTipClicks:0,linkTipClicks:0,tipsSubmitted:0,totalReceivedCents:0,monthReceivedCents:0},profileCompletion:{percentage:100,completedCount:6,totalCount:6,steps:[],profileIsLive:!0}},p=[{id:`aud-1`,type:`email`,displayName:`Sasha Fan`,locationLabel:`Los Angeles, US`,geoCity:`Los Angeles`,geoCountry:`US`,visits:12,engagementScore:87,intentLevel:`high`,latestActions:[{label:`Visited profile`,timestamp:new Date().toISOString()},{label:`Clicked link`,timestamp:new Date().toISOString()},{label:`Subscribed`,timestamp:new Date().toISOString()}],referrerHistory:[{url:`https://instagram.com`,timestamp:new Date().toISOString()},{url:`https://tiktok.com`,timestamp:new Date().toISOString()}],utmParams:{},email:`sasha@example.com`,phone:null,spotifyConnected:!1,purchaseCount:0,tipAmountTotalCents:3500,tipCount:5,tags:[`superfan`],deviceType:`mobile`,lastSeenAt:new Date().toISOString()},{id:`aud-2`,type:`anonymous`,displayName:null,locationLabel:`Unknown`,geoCity:null,geoCountry:null,visits:3,engagementScore:22,intentLevel:`low`,latestActions:[{label:`Visited profile`,timestamp:new Date().toISOString()}],referrerHistory:[],utmParams:{},email:null,phone:null,spotifyConnected:!1,purchaseCount:0,tipAmountTotalCents:0,tipCount:0,tags:[],deviceType:`desktop`,lastSeenAt:new Date().toISOString()},{id:`aud-3`,type:`sms`,displayName:`Text Fan`,locationLabel:`Austin, US`,geoCity:`Austin`,geoCountry:`US`,visits:7,engagementScore:55,intentLevel:`medium`,latestActions:[{label:`Subscribed`,timestamp:new Date().toISOString()},{label:`Visited profile`,timestamp:new Date().toISOString()}],referrerHistory:[{url:`https://youtube.com`,timestamp:new Date().toISOString()}],utmParams:{},email:null,phone:`+15555555555`,spotifyConnected:!1,purchaseCount:0,tipAmountTotalCents:1200,tipCount:2,tags:[`sms`],deviceType:`mobile`,lastSeenAt:new Date().toISOString()}],m={title:`Dashboard/Organisms/DashboardAudienceTable`,component:i,parameters:{layout:`fullscreen`,backgrounds:{default:`light`,values:[{name:`light`,value:`#ffffff`},{name:`dark`,value:`#0D0E12`}]},a11y:{config:{rules:[{id:`color-contrast`,enabled:!0}]}}},tags:[`autodocs`,`audience-a11y`],decorators:[e=>(0,d.jsx)(c,{dashboardData:f,children:(0,d.jsx)(o,{children:(0,d.jsx)(`div`,{className:`h-180 bg-surface-1 text-primary-token`,children:(0,d.jsx)(e,{})})})})]},h={args:{mode:`members`,rows:p,total:42,view:`all`,filters:a,subscriberCount:18,sort:`lastSeen`,direction:`desc`,onViewChange:()=>{},onFiltersChange:()=>{},onSortChange:()=>{}},parameters:{backgrounds:{default:`light`}}},g={args:{mode:`members`,rows:p,total:42,view:`all`,filters:a,subscriberCount:18,sort:`lastSeen`,direction:`desc`,onViewChange:()=>{},onFiltersChange:()=>{},onSortChange:()=>{}},parameters:{backgrounds:{default:`dark`}}},_={args:{mode:`subscribers`,rows:p.map(e=>({...e,type:e.email?`email`:`sms`})),total:12,view:`all`,filters:a,subscriberCount:12,sort:`createdAt`,direction:`desc`,onViewChange:()=>{},onFiltersChange:()=>{},onSortChange:()=>{}},parameters:{backgrounds:{default:`light`}}},v={args:{mode:`subscribers`,rows:p.map(e=>({...e,type:e.email?`email`:`sms`})),total:12,view:`all`,filters:a,subscriberCount:12,sort:`createdAt`,direction:`desc`,onViewChange:()=>{},onFiltersChange:()=>{},onSortChange:()=>{}},parameters:{backgrounds:{default:`dark`}}},y=[{city:`New York`,country:`US`},{city:`Los Angeles`,country:`US`},{city:`Chicago`,country:`US`},{city:`London`,country:`GB`},{city:`Paris`,country:`FR`},{city:`Berlin`,country:`DE`},{city:`Tokyo`,country:`JP`},{city:`Sydney`,country:`AU`},{city:`Toronto`,country:`CA`},{city:`São Paulo`,country:`BR`},{city:`Mumbai`,country:`IN`},{city:`Seoul`,country:`KR`},{city:`Mexico City`,country:`MX`},{city:`Amsterdam`,country:`NL`},{city:`Stockholm`,country:`SE`}],b=[`Alex`,`Jordan`,`Taylor`,`Morgan`,`Casey`,`Riley`,`Avery`,`Quinn`,`Reese`,`Finley`,`Charlie`,`Emery`,`Skyler`,`Dakota`,`Hayden`],x=[`Smith`,`Johnson`,`Williams`,`Brown`,`Jones`,`Garcia`,`Miller`,`Davis`,`Rodriguez`,`Martinez`,`Anderson`,`Taylor`,`Thomas`,`Moore`,`Jackson`],S=[`Visited profile`,`Clicked link`,`Subscribed`,`Tipped`,`Viewed release`,`Followed on Spotify`,`Purchased merch`],C=u(550),w={args:{mode:`members`,rows:C,total:C.length,view:`all`,filters:a,subscriberCount:C.length,sort:`lastSeen`,direction:`desc`,onViewChange:()=>{},onFiltersChange:()=>{},onSortChange:()=>{},profileUrl:`https://jovie.link/demo`},parameters:{backgrounds:{default:`light`},docs:{description:{story:`Demonstrates virtualization performance with 550 audience members. Open DevTools to verify only visible rows (~15-20) are rendered.`}}}},T={args:{mode:`members`,rows:C,total:C.length,view:`all`,filters:a,subscriberCount:C.length,sort:`lastSeen`,direction:`desc`,onViewChange:()=>{},onFiltersChange:()=>{},onSortChange:()=>{},profileUrl:`https://jovie.link/demo`},parameters:{backgrounds:{default:`dark`},docs:{description:{story:`Dark mode variant of the virtualization demo with 550 audience members.`}}}},E={args:{mode:`subscribers`,rows:C.map(e=>({...e,type:e.email?`email`:`sms`})),total:C.length,view:`all`,filters:a,subscriberCount:C.length,sort:`createdAt`,direction:`desc`,onViewChange:()=>{},onFiltersChange:()=>{},onSortChange:()=>{},profileUrl:`https://jovie.link/demo`},parameters:{backgrounds:{default:`light`},docs:{description:{story:`Virtualization demo for subscribers mode with 550 mock signups.`}}}},D=[`MembersLight`,`MembersDark`,`SubscribersLight`,`SubscribersDark`,`VirtualizationDemo`,`VirtualizationDemoDark`,`VirtualizationSubscribers`],h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'members',
    rows: mockMembers,
    total: 42,
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 18,
    sort: 'lastSeen',
    direction: 'desc',
    onViewChange: () => {},
    onFiltersChange: () => {},
    onSortChange: () => {}
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...h.parameters?.docs?.source}}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'members',
    rows: mockMembers,
    total: 42,
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 18,
    sort: 'lastSeen',
    direction: 'desc',
    onViewChange: () => {},
    onFiltersChange: () => {},
    onSortChange: () => {}
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'subscribers',
    rows: mockMembers.map(member => ({
      ...member,
      type: member.email ? 'email' : 'sms'
    })),
    total: 12,
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 12,
    sort: 'createdAt',
    direction: 'desc',
    onViewChange: () => {},
    onFiltersChange: () => {},
    onSortChange: () => {}
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'subscribers',
    rows: mockMembers.map(member => ({
      ...member,
      type: member.email ? 'email' : 'sms'
    })),
    total: 12,
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: 12,
    sort: 'createdAt',
    direction: 'desc',
    onViewChange: () => {},
    onFiltersChange: () => {},
    onSortChange: () => {}
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...v.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'members',
    rows: largeMemberSet,
    total: largeMemberSet.length,
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: largeMemberSet.length,
    sort: 'lastSeen',
    direction: 'desc',
    onViewChange: () => {},
    onFiltersChange: () => {},
    onSortChange: () => {},
    profileUrl: 'https://jovie.link/demo'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    },
    docs: {
      description: {
        story: 'Demonstrates virtualization performance with 550 audience members. Open DevTools to verify only visible rows (~15-20) are rendered.'
      }
    }
  }
}`,...w.parameters?.docs?.source},description:{story:`**Virtualization Performance Demo**

This story demonstrates the virtualization feature with 550 audience members.
Open your browser's DevTools → Elements panel to verify:

1. **DOM Efficiency**: Only ~15-20 \`<tr>\` elements should be rendered in the
   tbody at any time, not 550+. Scroll to see rows being recycled.

2. **Smooth Scrolling**: Scroll the table quickly - it should remain smooth
   without frame drops because we're not rendering 550 rows.

3. **Memory Usage**: Memory profile should stay flat despite large dataset.

4. **Absolute Positioning**: Each visible row uses \`position: absolute\` with
   \`translateY\` to position itself correctly within the virtualized container.

The \`@tanstack/react-virtual\` virtualizer handles row recycling with:
- Estimated row height: 60px
- Overscan: 5 rows above/below viewport`,...w.parameters?.docs?.description}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'members',
    rows: largeMemberSet,
    total: largeMemberSet.length,
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: largeMemberSet.length,
    sort: 'lastSeen',
    direction: 'desc',
    onViewChange: () => {},
    onFiltersChange: () => {},
    onSortChange: () => {},
    profileUrl: 'https://jovie.link/demo'
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    docs: {
      description: {
        story: 'Dark mode variant of the virtualization demo with 550 audience members.'
      }
    }
  }
}`,...T.parameters?.docs?.source},description:{story:`Same virtualization demo in dark mode.`,...T.parameters?.docs?.description}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    mode: 'subscribers',
    rows: largeMemberSet.map(member => ({
      ...member,
      type: member.email ? 'email' as const : 'sms' as const
    })),
    total: largeMemberSet.length,
    view: 'all',
    filters: DEFAULT_AUDIENCE_FILTERS,
    subscriberCount: largeMemberSet.length,
    sort: 'createdAt',
    direction: 'desc',
    onViewChange: () => {},
    onFiltersChange: () => {},
    onSortChange: () => {},
    profileUrl: 'https://jovie.link/demo'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    },
    docs: {
      description: {
        story: 'Virtualization demo for subscribers mode with 550 mock signups.'
      }
    }
  }
}`,...E.parameters?.docs?.source},description:{story:`Virtualization demo in subscribers mode.`,...E.parameters?.docs?.description}}}})))()}O();export{g as MembersDark,h as MembersLight,v as SubscribersDark,_ as SubscribersLight,w as VirtualizationDemo,T as VirtualizationDemoDark,E as VirtualizationSubscribers,D as __namedExportsOrder,m as default};
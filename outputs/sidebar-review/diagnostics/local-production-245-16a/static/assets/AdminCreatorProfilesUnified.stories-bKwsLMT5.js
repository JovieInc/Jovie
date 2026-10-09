import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./react-CFeKwT_a.js";import{t as n}from"./jsx-runtime-BbDfbRii.js";import{n as r,t as i}from"./AdminCreatorProfilesUnified-NN_mGu3z.js";import{r as a,t as o}from"./button-BSHhPV4e.js";import{n as s,t as c}from"./RightPanelContext-YZbrsGtE.js";import"./system-b-app-0raEe-jZ.js";function l(e){let t=[];for(let n=0;n<e;n++){let e=`${m[n%m.length]}${n}`,r=`${h[n%h.length]} ${g[n*7%g.length]}`,i=n%10==0,a=n%3!=0,o=n%25==0,s=n%3+2,c=Array.from({length:s},(t,r)=>{let i=p[(n+r)%p.length];return{id:`link-${n}-${r}`,platform:i.platform,platformType:i.platformType,url:`https://${i.platform}.com/${e}`,displayText:`${i.prefix}${e}`}}),l=[`idle`,`idle`,`idle`,`pending`,`processing`,`failed`],u=l[n%l.length],d=Math.floor(n*17%365),f=new Date(Date.now()-d*864e5);t.push({id:`profile-virt-${n}`,username:e,usernameNormalized:e.toLowerCase(),avatarUrl:`https://api.dicebear.com/7.x/avataaars/svg?seed=${e}`,displayName:r,isVerified:i,isFeatured:o,marketingOptOut:n%20==0,location:null,hometown:null,activeSinceYear:null,isClaimed:a,claimToken:a?null:`claim-token-${n}`,claimTokenExpiresAt:a?null:new Date(Date.now()+2592e6),userId:a?`user-${n}`:null,createdAt:f,confidence:Math.floor(n*23%100)/100,ingestionStatus:u,lastIngestionError:u===`failed`?`Failed to fetch profile data from Instagram API`:null,socialLinks:c})}return t}function u(){let[e,t]=(0,f.useState)(!0),n=e?_.slice(0,1):_;return(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)(o,{onClick:()=>t(e=>!e),children:e?`Clear Search`:`Search First Creator`}),(0,d.jsx)(i,{profiles:n,page:1,pageSize:20,total:n.length,search:e?_[0].username:``,sort:`created_desc`})]})}var d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E,D,O,k,A;function j(){return(j=e((()=>{d=n(),a(),f=t(),s(),r(),p=[{platform:`instagram`,platformType:`social`,prefix:`@`},{platform:`tiktok`,platformType:`social`,prefix:`@`},{platform:`youtube`,platformType:`social`,prefix:`@`},{platform:`twitter`,platformType:`social`,prefix:`@`},{platform:`spotify`,platformType:`music`,prefix:``},{platform:`apple_music`,platformType:`music`,prefix:``}],m=[`musiclover`,`beatmaker`,`songwriter`,`producer`,`artist`,`performer`,`vocalist`,`guitarist`,`drummer`,`pianist`,`djmix`,`rapper`,`singer`,`composer`,`musician`],h=[`Alex`,`Jordan`,`Taylor`,`Morgan`,`Casey`,`Riley`,`Avery`,`Quinn`,`Reese`,`Finley`],g=[`Smith`,`Johnson`,`Williams`,`Brown`,`Jones`,`Garcia`,`Miller`,`Davis`],_=l(15),v=l(550),y={title:`Admin/Tables/CreatorProfiles`,component:i,parameters:{layout:`fullscreen`,backgrounds:{default:`light`,values:[{name:`light`,value:`#ffffff`},{name:`dark`,value:`#0D0E12`}]},a11y:{config:{rules:[{id:`color-contrast`,enabled:!0}]}}},tags:[`autodocs`,`creators-a11y`],decorators:[e=>(0,d.jsx)(c,{children:(0,d.jsx)(`div`,{className:`h-200 bg-base text-primary-token`,children:(0,d.jsx)(e,{})})})]},b={render:()=>(0,d.jsx)(u,{})},x={args:{profiles:_,page:1,pageSize:20,total:_.length,search:``,sort:`created_desc`},parameters:{backgrounds:{default:`light`}}},S={args:{profiles:_,page:1,pageSize:20,total:_.length,search:``,sort:`created_desc`},parameters:{backgrounds:{default:`dark`}}},C={args:{profiles:_.filter(e=>e.isVerified),page:1,pageSize:20,total:_.filter(e=>e.isVerified).length,search:``,sort:`verified_desc`},parameters:{backgrounds:{default:`light`}}},w={args:{profiles:_.filter(e=>e.isFeatured),page:1,pageSize:20,total:_.filter(e=>e.isFeatured).length,search:``,sort:`created_desc`},parameters:{backgrounds:{default:`light`}}},T={args:{profiles:v,page:1,pageSize:v.length,total:v.length,search:``,sort:`created_desc`},parameters:{backgrounds:{default:`light`},docs:{description:{story:`Demonstrates virtualization performance with 550 creator profiles. Open DevTools to verify only visible rows (~15-20) are rendered. Table should scroll smoothly at 60fps.`}}}},E={args:{profiles:v,page:1,pageSize:v.length,total:v.length,search:``,sort:`created_desc`},parameters:{backgrounds:{default:`dark`},docs:{description:{story:`Dark mode variant of the virtualization demo with 550 creator profiles.`}}}},D={args:{profiles:[],page:1,pageSize:20,total:0,search:`nonexistent-creator`,sort:`created_desc`},parameters:{backgrounds:{default:`light`}}},O={args:{profiles:[],page:1,pageSize:20,total:0,search:``,sort:`created_desc`},parameters:{backgrounds:{default:`light`}}},k={args:{profiles:_.filter(e=>e.ingestionStatus===`failed`),page:1,pageSize:20,total:_.filter(e=>e.ingestionStatus===`failed`).length,search:``,sort:`created_desc`},parameters:{backgrounds:{default:`light`}}},A=[`SearchNavigation`,`Default`,`DarkMode`,`VerifiedCreators`,`FeaturedCreators`,`VirtualizationDemo`,`VirtualizationDemoDark`,`EmptyState`,`LoadingState`,`WithIngestionErrors`],b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  render: () => <SearchNavigationFixture />
}`,...b.parameters?.docs?.source},description:{story:`Clearing and restoring a server search must preserve separate cached rows.`,...b.parameters?.docs?.description}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: mockProfiles,
    page: 1,
    pageSize: 20,
    total: mockProfiles.length,
    search: '',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...x.parameters?.docs?.source},description:{story:`Default light mode with 15 creator profiles.`,...x.parameters?.docs?.description}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: mockProfiles,
    page: 1,
    pageSize: 20,
    total: mockProfiles.length,
    search: '',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...S.parameters?.docs?.source},description:{story:`Dark mode variant.`,...S.parameters?.docs?.description}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: mockProfiles.filter(p => p.isVerified),
    page: 1,
    pageSize: 20,
    total: mockProfiles.filter(p => p.isVerified).length,
    search: '',
    sort: 'verified_desc'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...C.parameters?.docs?.source},description:{story:`Verified creators only (filtered view).`,...C.parameters?.docs?.description}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: mockProfiles.filter(p => p.isFeatured),
    page: 1,
    pageSize: 20,
    total: mockProfiles.filter(p => p.isFeatured).length,
    search: '',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...w.parameters?.docs?.source},description:{story:`Featured creators view.`,...w.parameters?.docs?.description}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: largeProfileSet,
    page: 1,
    pageSize: largeProfileSet.length,
    // Show all at once to demo virtualization
    total: largeProfileSet.length,
    search: '',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    },
    docs: {
      description: {
        story: 'Demonstrates virtualization performance with 550 creator profiles. Open DevTools to verify only visible rows (~15-20) are rendered. Table should scroll smoothly at 60fps.'
      }
    }
  }
}`,...T.parameters?.docs?.source},description:{story:`**Virtualization Performance Demo**

This story demonstrates the virtualization feature with 550 creator profiles.
Open your browser's DevTools → Elements panel to verify:

1. **DOM Efficiency**: Only ~15-20 \`<tr>\` elements should be rendered in the
   tbody at any time, not 550+. Scroll to see rows being recycled.

2. **Smooth Scrolling**: Scroll the table quickly - it should remain smooth
   at 60fps without frame drops because we're not rendering 550 rows.

3. **Memory Usage**: Memory profile should stay flat despite large dataset.

4. **Absolute Positioning**: Each visible row uses \`position: absolute\` with
   \`translateY\` to position itself correctly within the virtualized container.

The \`@tanstack/react-virtual\` virtualizer handles row recycling with:
- Estimated row height: 52px
- Overscan: 5 rows above/below viewport
- Auto-enable threshold: 20+ rows

**Performance Targets**:
- Initial render: <100ms
- Scroll FPS: 60fps
- Row selection: <10ms`,...T.parameters?.docs?.description}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: largeProfileSet,
    page: 1,
    pageSize: largeProfileSet.length,
    total: largeProfileSet.length,
    search: '',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    },
    docs: {
      description: {
        story: 'Dark mode variant of the virtualization demo with 550 creator profiles.'
      }
    }
  }
}`,...E.parameters?.docs?.source},description:{story:`Virtualization demo in dark mode.`,...E.parameters?.docs?.description}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: [],
    page: 1,
    pageSize: 20,
    total: 0,
    search: 'nonexistent-creator',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...D.parameters?.docs?.source},description:{story:`Empty state when no creators match search/filters.`,...D.parameters?.docs?.description}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: [],
    page: 1,
    pageSize: 20,
    total: 0,
    search: '',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...O.parameters?.docs?.source},description:{story:`Loading state skeleton (simulated).`,...O.parameters?.docs?.description}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    profiles: mockProfiles.filter(p => p.ingestionStatus === 'failed'),
    page: 1,
    pageSize: 20,
    total: mockProfiles.filter(p => p.ingestionStatus === 'failed').length,
    search: '',
    sort: 'created_desc'
  },
  parameters: {
    backgrounds: {
      default: 'light'
    }
  }
}`,...k.parameters?.docs?.source},description:{story:`Profiles with ingestion errors.`,...k.parameters?.docs?.description}}}})))()}j();export{S as DarkMode,x as Default,D as EmptyState,w as FeaturedCreators,O as LoadingState,b as SearchNavigation,C as VerifiedCreators,T as VirtualizationDemo,E as VirtualizationDemoDark,k as WithIngestionErrors,A as __namedExportsOrder,y as default};
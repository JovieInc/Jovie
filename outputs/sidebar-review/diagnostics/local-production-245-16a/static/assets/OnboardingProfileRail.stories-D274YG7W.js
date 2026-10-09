import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,r,t as i}from"./OnboardingProfileRail-DVkd4C7N.js";var a,o,s,c,l,u,d;function f(){return(f=e((()=>{a=t(),r(),o={artist:{id:`artist-1`,name:`Test Artist`,url:`https://open.spotify.com/artist/artist-1`,imageUrl:`https://i.scdn.co/image/test`,followers:12300,genres:[`progressive house`]},artistConfirmed:!0,handle:`testartist`,socialLinks:[]},s={title:`Features/Onboarding/OnboardingProfileRail`,component:n,parameters:{layout:`centered`}},c={args:{state:i}},l={args:{placement:`side`,state:o},render:()=>(0,a.jsx)(`div`,{"data-testid":`onboarding-rail-clearance-fixture`,style:{height:692,width:380},children:(0,a.jsx)(n,{placement:`side`,state:o})})},u={args:{placement:`inline`,state:o},render:()=>(0,a.jsx)(`div`,{"data-testid":`onboarding-rail-clearance-fixture`,style:{width:360},children:(0,a.jsx)(n,{placement:`inline`,state:o})})},d=[`Default`,`SideClearance`,`InlineClearance`],c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    state: EMPTY_ONBOARDING_PROFILE_BUILDER_STATE
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    placement: 'side',
    state: CONFIRMED_ARTIST_STATE
  },
  render: () => <div data-testid='onboarding-rail-clearance-fixture' style={{
    height: 692,
    width: 380
  }}>
      <OnboardingProfileRail placement='side' state={CONFIRMED_ARTIST_STATE} />
    </div>
}`,...l.parameters?.docs?.source},description:{story:`Golden-path desktop rail at 1280×720: the app shell's right rail is ~692px
tall there (measured from the 2026-10-03 keyframe). The DSP strip must stay
clear of the phone's Listen now CTA.`,...l.parameters?.docs?.description}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    placement: 'inline',
    state: CONFIRMED_ARTIST_STATE
  },
  render: () => <div data-testid='onboarding-rail-clearance-fixture' style={{
    width: 360
  }}>
      <OnboardingProfileRail placement='inline' state={CONFIRMED_ARTIST_STATE} />
    </div>
}`,...u.parameters?.docs?.source},description:{story:`Golden-path mobile width (390×844) uses the inline rail.`,...u.parameters?.docs?.description}}}})))()}f();export{c as Default,u as InlineClearance,l as SideClearance,d as __namedExportsOrder,s as default};
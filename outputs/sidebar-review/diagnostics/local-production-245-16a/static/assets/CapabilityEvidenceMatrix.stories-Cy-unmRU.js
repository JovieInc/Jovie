import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{s as n,t as r}from"./routes-NOD5Mahi.js";import{n as i,t as a}from"./ContentMetricRow-DfBrYav4.js";import{r as o,t as s}from"./ContentSurfaceCard-NsoaLSLh.js";function c(e){return e.exposure.error||e.outcome.error?`failure`:e.certification?e.deployment.commitSha?e.clientSha&&e.deployment.commitSha&&e.clientSha!==e.deployment.commitSha?`stale-client`:e.exposure.measured?e.exposure.stale||e.outcome.stale?`stale-observation`:e.rollout.configuredPercent!==null&&e.rollout.configuredPercent<100?`partial-rollout`:e.outcome.measured?`healthy`:`configured-unobserved`:e.rollout.configuredPercent!==null||e.rollout.gate?`configured-unobserved`:`deployed-only`:`merged-only`:`unknown`}var l;function u(){return(u=e((()=>{l={unknown:`Unknown`,failure:`Observation failure`,"merged-only":`Merged only`,"deployed-only":`Deployed, unobserved`,"configured-unobserved":`Configured, unobserved`,"stale-observation":`Stale observation`,"stale-client":`Stale client`,"partial-rollout":`Partial rollout`,healthy:`Healthy`}})))()}function d(e){if(e.error)return`source error`;if(!e.measured)return g;let t=(e.count??0).toLocaleString(`en-US`),n=e.latestAt?` · latest ${e.latestAt}`:``;return`${t} in ${e.windowDays}d${e.stale?` · stale`:``}${n}`}function f(e){let{commitSha:t,version:n,environment:r}=e.deployment;if(!t)return g;let i=t.slice(0,7),a=n?`${n} ${i}`:i;return r?`${a} (${r})`:a}function p({record:e}){let t=c(e),{certification:n,deployment:i}=e,o=i.commitSha?`${h}/commit/${i.commitSha}`:null,u=n?.decisionEvidenceDigest.slice(0,12)??null;return(0,m.jsx)(s,{surface:`details`,"data-testid":`capability-evidence-matrix`,"data-stage":t,"data-capability":e.capabilityId,children:(0,m.jsxs)(`div`,{className:`space-y-3 p-3`,children:[(0,m.jsxs)(`div`,{children:[(0,m.jsx)(`h2`,{className:`line-clamp-2 text-app font-semibold text-primary-token`,children:e.title}),(0,m.jsxs)(`p`,{className:`text-2xs text-tertiary-token`,children:[e.capabilityId,` · `,e.subjectId,` · `,e.goldenPath]})]}),(0,m.jsxs)(`div`,{className:`grid gap-2 sm:grid-cols-2`,"data-testid":`capability-evidence-rows`,children:[(0,m.jsx)(a,{label:`Stage`,value:l[t]}),(0,m.jsx)(a,{label:`Certified`,value:n?`${n.state} (${n.readiness})`:g}),(0,m.jsx)(a,{label:`Evidence Rev`,value:u?`${u}…`:g}),(0,m.jsx)(a,{label:`Deployed Build`,value:f(e)}),(0,m.jsx)(a,{label:`Configured Rollout`,value:e.rollout.gate??`Ungated`}),(0,m.jsx)(a,{label:`Observed Exposure`,value:d(e.exposure)}),(0,m.jsx)(a,{label:`Observed Outcome`,value:d(e.outcome)}),(0,m.jsx)(a,{label:`Running Client`,value:e.clientSha?e.clientSha.slice(0,7):`unknown`})]}),(0,m.jsxs)(`p`,{className:`min-h-4 break-words text-2xs leading-4 text-tertiary-token`,children:[`Exposure: `,e.exposure.population,e.outcome.measured?` · Outcome: ${e.outcome.population}`:``]}),(0,m.jsxs)(`div`,{className:`flex flex-wrap gap-3 text-2xs font-medium`,children:[(0,m.jsx)(`a`,{className:`text-secondary-token hover:text-primary-token`,href:r.ADMIN_FEATURES,children:`Feature registry →`}),(0,m.jsx)(`a`,{className:`text-secondary-token hover:text-primary-token`,href:r.ADMIN_RELEASES,children:`Release entities →`}),o?(0,m.jsx)(`a`,{className:`text-secondary-token hover:text-primary-token`,href:o,target:`_blank`,rel:`noreferrer`,children:`Deployed commit →`}):null,(0,m.jsx)(`a`,{className:`text-secondary-token hover:text-primary-token`,href:`${h}/blob/main/${n?.sourcePath??`docs/FEATURE_REGISTRY.md`}`,target:`_blank`,rel:`noreferrer`,children:`Registry source →`})]})]})})}var m,h,g;function _(){return(_=e((()=>{m=t(),i(),o(),n(),u(),h=`https://github.com/JovieInc/Jovie`,g=`n/a`})))()}var v,y,b,x,S,C,w,T,E,D,O,k;function A(){return(A=e((()=>{_(),v={capabilityId:`public-profile-pages`,subjectId:`feature.profile.public-profile-pages`,title:`Public profile pages`,goldenPath:`Fan opens a public profile and taps a link.`,certification:{state:`review_ready`,readiness:`ready`,decisionEvidenceDigest:`a`.repeat(40),sourcePath:`docs/FEATURE_REGISTRY.md`},deployment:{commitSha:`b`.repeat(40),version:`1.2.3`,environment:`production`,deploymentId:`story-deployment`},rollout:{gate:null,configuredPercent:null},clientSha:null,exposure:{measured:!0,count:128,latestAt:`2026-10-02`,stale:!1,windowDays:7,population:`public claimed profiles owned by non-internal accounts`,error:null},outcome:{measured:!0,count:41,latestAt:`2026-10-02`,stale:!1,windowDays:7,population:`public claimed profiles; bot-filtered link taps`,error:null},generatedAt:`2026-10-02T00:00:00.000Z`},y={title:`Admin/CapabilityEvidenceMatrix`,component:p,parameters:{layout:`padded`},args:{record:v}},b={},x={args:{record:{...v,certification:null}}},S={args:{record:{...v,exposure:{...v.exposure,measured:!1,count:null,error:`Read unavailable`}}}},C={args:{record:{...v,deployment:{commitSha:null,version:null,environment:null,deploymentId:null}}}},w={args:{record:{...v,exposure:{...v.exposure,measured:!1,count:null,latestAt:null}}}},T={args:{record:{...v,rollout:{gate:`profile-capability`,configuredPercent:100},exposure:{...v.exposure,measured:!1,count:null,latestAt:null}}}},E={args:{record:{...v,exposure:{...v.exposure,stale:!0}}}},D={args:{record:{...v,clientSha:`c`.repeat(40)}}},O={args:{record:{...v,rollout:{gate:`profile-capability`,configuredPercent:25}}}},k=[`Healthy`,`Unknown`,`ObservationFailure`,`MergedOnly`,`DeployedUnobserved`,`ConfiguredUnobserved`,`StaleObservation`,`StaleClient`,`PartialRollout`],b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      certification: null
    }
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      exposure: {
        ...record.exposure,
        measured: false,
        count: null,
        error: 'Read unavailable'
      }
    }
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      deployment: {
        commitSha: null,
        version: null,
        environment: null,
        deploymentId: null
      }
    }
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      exposure: {
        ...record.exposure,
        measured: false,
        count: null,
        latestAt: null
      }
    }
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      rollout: {
        gate: 'profile-capability',
        configuredPercent: 100
      },
      exposure: {
        ...record.exposure,
        measured: false,
        count: null,
        latestAt: null
      }
    }
  }
}`,...T.parameters?.docs?.source}}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      exposure: {
        ...record.exposure,
        stale: true
      }
    }
  }
}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      clientSha: 'c'.repeat(40)
    }
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    record: {
      ...record,
      rollout: {
        gate: 'profile-capability',
        configuredPercent: 25
      }
    }
  }
}`,...O.parameters?.docs?.source}}}})))()}A();export{T as ConfiguredUnobserved,w as DeployedUnobserved,b as Healthy,C as MergedOnly,S as ObservationFailure,O as PartialRollout,D as StaleClient,E as StaleObservation,x as Unknown,k as __namedExportsOrder,y as default};
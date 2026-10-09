import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./OpportunityInboxReportCard-KF5w20Hg.js";var r,i,a,o,s;function c(){return(c=e((()=>{t(),r={id:`card-1`,signalType:`other`,typeLabel:`Experiment result`,createdAt:new Date().toISOString(),title:`Release-day CTA swap lifted saves`,why:`The "Listen now" primary CTA outperformed "Save for later" on release day.`,primaryActionLabel:`Review`,status:`pending`,category:`report`,report:{metricLabel:`Saves per visitor`,deltaPercent:18,deltaDisplay:`+18%`,direction:`up`,series:[4,5,5,6,7,8,9],items:[{label:`Mobile`,deltaPercent:22,detail:`1,204 visitors`},{label:`Desktop`,deltaPercent:9,detail:`318 visitors`}],experimentId:`exp-cta-swap-1`,nextStep:{label:`Roll out to all releases`,kind:`apply_experiment`}}},i={title:`Features/OpportunityInbox/OpportunityInboxReportCard`,component:n,parameters:{layout:`centered`},args:{card:r,onNextStep:()=>{},onDismiss:()=>{}}},a={},o={args:{card:{...r,report:{metricLabel:r.report?.metricLabel??``,deltaPercent:-6,deltaDisplay:`-6%`,direction:`down`,series:r.report?.series??[],items:r.report?.items??[],experimentId:r.report?.experimentId??null,nextStep:null}}}},s=[`Up`,`Down`],a.parameters={...a.parameters,docs:{...a.parameters?.docs,source:{originalSource:`{}`,...a.parameters?.docs?.source}}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  args: {
    card: {
      ...card,
      report: {
        metricLabel: card.report?.metricLabel ?? '',
        deltaPercent: -6,
        deltaDisplay: '-6%',
        direction: 'down',
        series: card.report?.series ?? [],
        items: card.report?.items ?? [],
        experimentId: card.report?.experimentId ?? null,
        nextStep: null
      }
    }
  }
}`,...o.parameters?.docs?.source}}}})))()}c();export{o as Down,a as Up,s as __namedExportsOrder,i as default};
import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{n as t,t as n}from"./ReleaseDueBadge-DsVBzF_v.js";function r(e){let t=new Date;return t.setDate(t.getDate()+e),t}var i,a,o,s,c,l,u,d,f,p,m,h,g;function _(){return(_=e((()=>{t(),{expect:i,fn:a,userEvent:o,within:s}=__STORYBOOK_MODULE_TEST__,c={title:`Molecules/ReleaseDueBadge`,component:n,parameters:{layout:`centered`},args:{dueDate:r(14),dueDaysOffset:14}},l={},u={args:{dueDate:r(2),dueDaysOffset:2}},d={args:{dueDate:r(0),dueDaysOffset:0}},f={args:{dueDate:r(-5),dueDaysOffset:-5}},p={args:{dueDate:r(-120),dueDaysOffset:-120}},m={args:{dueDate:null,dueDaysOffset:7,onSetDate:a()},play:async({canvasElement:e,args:t})=>{let n=s(e).getByRole(`button`,{name:`Set date`});await o.click(n),await i(t.onSetDate).toHaveBeenCalled()}},h={args:{isCompleted:!0}},g=[`Future`,`DueSoon`,`DueToday`,`Overdue`,`StaleOverdue`,`NoDateSet`,`Completed`],l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    dueDate: daysFromNow(2),
    dueDaysOffset: 2
  }
}`,...u.parameters?.docs?.source}}},d.parameters={...d.parameters,docs:{...d.parameters?.docs,source:{originalSource:`{
  args: {
    dueDate: daysFromNow(0),
    dueDaysOffset: 0
  }
}`,...d.parameters?.docs?.source}}},f.parameters={...f.parameters,docs:{...f.parameters?.docs,source:{originalSource:`{
  args: {
    dueDate: daysFromNow(-5),
    dueDaysOffset: -5
  }
}`,...f.parameters?.docs?.source}}},p.parameters={...p.parameters,docs:{...p.parameters?.docs,source:{originalSource:`{
  args: {
    dueDate: daysFromNow(-120),
    dueDaysOffset: -120
  }
}`,...p.parameters?.docs?.source}}},m.parameters={...m.parameters,docs:{...m.parameters?.docs,source:{originalSource:`{
  args: {
    dueDate: null,
    dueDaysOffset: 7,
    onSetDate: fn()
  },
  play: async ({
    canvasElement,
    args
  }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Set date'
    });
    await userEvent.click(trigger);
    await expect(args.onSetDate).toHaveBeenCalled();
  }
}`,...m.parameters?.docs?.source}}},h.parameters={...h.parameters,docs:{...h.parameters?.docs,source:{originalSource:`{
  args: {
    isCompleted: true
  }
}`,...h.parameters?.docs?.source}}}})))()}_();export{h as Completed,u as DueSoon,d as DueToday,l as Future,m as NoDateSet,f as Overdue,p as StaleOverdue,g as __namedExportsOrder,c as default};
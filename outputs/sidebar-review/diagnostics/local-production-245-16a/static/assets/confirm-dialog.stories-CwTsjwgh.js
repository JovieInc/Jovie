import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./confirm-dialog-Bj23P1Xn.js";var i,a,o,s,c,l,u,d;function f(){return(f=e((()=>{i=t(),n(),{fn:a}=__STORYBOOK_MODULE_TEST__,o={title:`UI/Molecules/ConfirmDialog`,component:r,parameters:{layout:`centered`},tags:[`autodocs`],args:{open:!0,onOpenChange:a(),onConfirm:a(),title:`Remove contact?`,body:`Avery will no longer appear in Audience. Their visit history will stay in analytics.`,cancelLabel:`Keep contact`,confirmLabel:`Remove contact`}},s={},c={args:{variant:`destructive`,title:`Delete release?`,body:`This removes the release from your profile and disables its public links.`,cancelLabel:`Keep release`,confirmLabel:`Delete release`}},l={args:{isLoading:!0,title:`Disconnect Spotify?`,body:`Jovie is disconnecting Spotify and preserving the latest synced data.`,cancelLabel:`Keep connected`,confirmLabel:`Disconnect`}},u={args:{confirmDisabled:!0,variant:`destructive`,title:`Delete your account?`,body:`Enter DELETE before permanently removing your profile and workspace data.`,cancelLabel:`Keep account`,confirmLabel:`Delete account`,children:(0,i.jsxs)(`label`,{className:`grid gap-2 text-sm font-medium text-primary-token`,children:[`Confirmation`,(0,i.jsx)(`input`,{className:`h-10 rounded-control border border-default bg-surface-0 px-3 text-sm font-normal outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/16`,placeholder:`Type DELETE`})]})}},d=[`Default`,`Destructive`,`Pending`,`ConfirmationRequired`],s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    variant: 'destructive',
    title: 'Delete release?',
    body: 'This removes the release from your profile and disables its public links.',
    cancelLabel: 'Keep release',
    confirmLabel: 'Delete release'
  }
}`,...c.parameters?.docs?.source}}},l.parameters={...l.parameters,docs:{...l.parameters?.docs,source:{originalSource:`{
  args: {
    isLoading: true,
    title: 'Disconnect Spotify?',
    body: 'Jovie is disconnecting Spotify and preserving the latest synced data.',
    cancelLabel: 'Keep connected',
    confirmLabel: 'Disconnect'
  }
}`,...l.parameters?.docs?.source}}},u.parameters={...u.parameters,docs:{...u.parameters?.docs,source:{originalSource:`{
  args: {
    confirmDisabled: true,
    variant: 'destructive',
    title: 'Delete your account?',
    body: 'Enter DELETE before permanently removing your profile and workspace data.',
    cancelLabel: 'Keep account',
    confirmLabel: 'Delete account',
    children: <label className='grid gap-2 text-sm font-medium text-primary-token'>
        Confirmation
        <input className='h-10 rounded-control border border-default bg-surface-0 px-3 text-sm font-normal outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/16' placeholder='Type DELETE' />
      </label>
  }
}`,...u.parameters?.docs?.source}}}})))()}f();export{u as ConfirmationRequired,s as Default,c as Destructive,l as Pending,d as __namedExportsOrder,o as default};
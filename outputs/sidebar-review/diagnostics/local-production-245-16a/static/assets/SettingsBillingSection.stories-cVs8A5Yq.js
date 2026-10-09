import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{H as n,U as r}from"./removable-_8fTgXVw.js";import{c as i,s as a}from"./iframe-B1b4EUuv.js";import{n as o,t as s}from"./keys-CNuKOgyu.js";import{n as c,t as l}from"./SettingsBillingSection-irf3WJUs.js";function u({billing:e,children:t,unavailable:r}){let i=new a({defaultOptions:{queries:{retry:!1,retryOnMount:!1,refetchOnWindowFocus:!1,staleTime:1/0}}});return e?i.setQueryData(o.billing.status(),e):r||i.prefetchQuery({queryKey:o.billing.status(),queryFn:()=>new Promise(()=>{})}),r&&i.getQueryCache().build(i,{queryKey:o.billing.status()}).setState({status:`error`,error:Error(`Billing status could not be loaded`),fetchStatus:r===`retrying`?`fetching`:`idle`}),(0,d.jsx)(n,{client:i,children:(0,d.jsx)(`div`,{className:`w-xl max-w-full bg-base p-4 text-primary-token`,children:t})})}var d,f,p,m,h,g,_,v,y,b,x,S,C,w,T,E;function D(){return(D=e((()=>{d=t(),i(),r(),s(),c(),{expect:f,userEvent:p,waitFor:m,within:h}=__STORYBOOK_MODULE_TEST__,g={isPro:!0,plan:`pro`,hasStripeCustomer:!0,stripeSubscriptionId:`sub_story`,stale:!1,staleReason:null,trialStartedAt:null,trialEndsAt:null,trialNotificationsSent:0},_={title:`Features/Dashboard/SettingsBillingSection`,component:l,parameters:{layout:`centered`}},v={decorators:[e=>(0,d.jsx)(u,{billing:g,children:(0,d.jsx)(e,{})})]},y={decorators:[e=>(0,d.jsx)(u,{billing:{...g,stale:!0,staleReason:`Payment service temporarily unavailable`},children:(0,d.jsx)(e,{})})]},b={decorators:[e=>(0,d.jsx)(u,{billing:{...g,isPro:!1,plan:`free`,hasStripeCustomer:!1,stripeSubscriptionId:null},children:(0,d.jsx)(e,{})})]},x={decorators:[e=>(0,d.jsx)(u,{billing:null,children:(0,d.jsx)(e,{})})]},S={decorators:[e=>(0,d.jsx)(u,{billing:null,unavailable:`error`,children:(0,d.jsx)(e,{})})]},C={decorators:[e=>(0,d.jsx)(u,{billing:g,unavailable:`error`,children:(0,d.jsx)(e,{})})]},w={decorators:[e=>(0,d.jsx)(u,{billing:null,unavailable:`retrying`,children:(0,d.jsx)(e,{})})]},T={...S,play:async({canvasElement:e})=>{let t=h(e),n=globalThis,r=n.__jovieApiMock,i,a=new Promise(e=>{i=e}),o=0;n.__jovieApiMock=e=>e.url.pathname===`/api/billing/status`?(o+=1,a.then(()=>Response.json({isPro:!0,plan:`pro`,stripeCustomerId:`cus_story`}))):r?.(e);try{let e=t.getByRole(`button`,{name:`Retry billing`}),n=e.getBoundingClientRect().toJSON();e.focus(),await p.keyboard(`{Enter}`),await m(()=>f(e).toHaveAttribute(`aria-busy`,`true`)),await f(e).toHaveFocus(),await f(e).toHaveAccessibleName(`Retry billing`),await f(e.getBoundingClientRect().toJSON()).toEqual(n),await p.keyboard(` `),await f(o).toBe(1),i(),await m(()=>f(e).toHaveAccessibleName(`Manage in Stripe`)),await f(e).toHaveFocus(),await f(e.getBoundingClientRect().toJSON()).toEqual(n),await f(t.getByText(`Pro plan`)).toBeVisible(),await f(o).toBe(1)}finally{i(),n.__jovieApiMock=r}}},E=[`Active`,`CachedWithWarning`,`Free`,`Loading`,`Unavailable`,`UnavailableWithCachedPlan`,`Retrying`,`RetryRecovery`],v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BillingStoryShell billing={baseBilling}>
        <Story />
      </BillingStoryShell>]
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BillingStoryShell billing={{
    ...baseBilling,
    stale: true,
    staleReason: 'Payment service temporarily unavailable'
  }}>
        <Story />
      </BillingStoryShell>]
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BillingStoryShell billing={{
    ...baseBilling,
    isPro: false,
    plan: 'free',
    hasStripeCustomer: false,
    stripeSubscriptionId: null
  }}>
        <Story />
      </BillingStoryShell>]
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BillingStoryShell billing={null}>
        <Story />
      </BillingStoryShell>]
}`,...x.parameters?.docs?.source},description:{story:`Billing status query in flight: isLoading renders the "Syncing" badge.`,...x.parameters?.docs?.description}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BillingStoryShell billing={null} unavailable='error'>
        <Story />
      </BillingStoryShell>]
}`,...S.parameters?.docs?.source},description:{story:`Failed status must not advertise an unknown subscription as Free.`,...S.parameters?.docs?.description}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BillingStoryShell billing={baseBilling} unavailable='error'>
        <Story />
      </BillingStoryShell>]
}`,...C.parameters?.docs?.source},description:{story:`A failed cached refresh must not claim current paid-state verification.`,...C.parameters?.docs?.description}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  decorators: [Story => <BillingStoryShell billing={null} unavailable='retrying'>
        <Story />
      </BillingStoryShell>]
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  ...Unavailable,
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const apiWindow = globalThis as typeof globalThis & {
      __jovieApiMock?: (request: {
        url: URL;
        init?: RequestInit;
      }) => Response | Promise<Response> | undefined;
    };
    const previousMock = apiWindow.__jovieApiMock;
    let finishRetry!: () => void;
    const pendingResponse = new Promise<void>(resolve => {
      finishRetry = resolve;
    });
    let requests = 0;
    apiWindow.__jovieApiMock = request => {
      if (request.url.pathname !== '/api/billing/status') {
        return previousMock?.(request);
      }
      requests += 1;
      return pendingResponse.then(() => Response.json({
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_story'
      }));
    };
    try {
      const retry = canvas.getByRole('button', {
        name: 'Retry billing'
      });
      const bounds = retry.getBoundingClientRect().toJSON();
      retry.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(retry).toHaveAttribute('aria-busy', 'true'));
      await expect(retry).toHaveFocus();
      await expect(retry).toHaveAccessibleName('Retry billing');
      await expect(retry.getBoundingClientRect().toJSON()).toEqual(bounds);
      await userEvent.keyboard(' ');
      await expect(requests).toBe(1);
      finishRetry();
      await waitFor(() => expect(retry).toHaveAccessibleName('Manage in Stripe'));
      await expect(retry).toHaveFocus();
      await expect(retry.getBoundingClientRect().toJSON()).toEqual(bounds);
      await expect(canvas.getByText('Pro plan')).toBeVisible();
      await expect(requests).toBe(1);
    } finally {
      finishRetry();
      apiWindow.__jovieApiMock = previousMock;
    }
  }
}`,...T.parameters?.docs?.source},description:{story:`Runs in the existing Storybook browser/a11y lane with the real query hook.`,...T.parameters?.docs?.description}}}})))()}D();export{v as Active,y as CachedWithWarning,b as Free,x as Loading,T as RetryRecovery,w as Retrying,S as Unavailable,C as UnavailableWithCachedPlan,E as __namedExportsOrder,_ as default};
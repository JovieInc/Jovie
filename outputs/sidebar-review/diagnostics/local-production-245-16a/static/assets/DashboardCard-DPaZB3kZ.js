import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{i as n,t as r}from"./utils-AN1vFgqV.js";import{n as i,r as a}from"./ContentSurfaceCard-NsoaLSLh.js";function o(e,...t){return String.raw({raw:e},...t).replaceAll(/\s+/g,` `).trim()}var s,c;function l(){return(l=e((()=>{a(),s={fast:`duration-fast`,normal:`duration-normal`,slow:`duration-slow`,easing:`ease-interactive`},c={base:`${i()} transition-[background-color,border-color] ${s.slow} ${s.easing}`,padding:{none:`p-0`,micro:`p-2 sm:p-3`,compact:`p-3 sm:p-4`,default:`p-4 sm:p-6`,large:`p-5 sm:p-8`,spacious:`p-6 sm:p-10`},radius:{none:`rounded-none`,minimal:`rounded-md`,small:`rounded-lg`,default:`rounded-xl`,large:`rounded-2xl`,full:`rounded-full`},shadow:{none:`shadow-none`,subtle:`shadow-sm`,default:`shadow-md`,medium:`shadow-lg`,large:`shadow-xl`},border:{none:`border-0`,subtle:`border border-subtle`,default:`border border-default`,strong:`border border-strong`,accent:`border border-accent`},interactive:{hover:o`
      hover:bg-surface-2
      hover:border-default
      transition ${s.normal} ${s.easing}
    `,active:o`
      active:bg-surface-3
    `,focus:o`
      focus-visible:outline-none
      focus-visible:ring-2
      focus-visible:ring-accent
      focus-visible:ring-offset-2
      focus-visible:ring-offset-base
    `},glass:{subtle:`backdrop-blur-sm bg-(--app-shell-content-surface)/80`,medium:`backdrop-blur-md bg-(--app-shell-content-surface)/70`,strong:`backdrop-blur-lg bg-(--app-shell-content-surface)/60`},status:{success:`border-success bg-success-subtle`,warning:`border-warning bg-warning-subtle`,error:`border-error bg-error-subtle`,info:`border-info bg-info-subtle`},variants:{default:o`
      bg-surface-1
    `,interactive:o`
      bg-surface-1
      cursor-pointer
      transition-[background-color,border-color] ${s.normal} ${s.easing}
      hover:bg-surface-0
      hover:border-default
      focus-visible:outline-none
      focus-visible:ring-2
      focus-visible:ring-ring
      focus-visible:ring-offset-2
    `,settings:o`
      bg-surface-1
    `,analytics:o`
      bg-surface-1
      transition-[background-color,border-color] ${s.fast} ${s.easing}
      hover:bg-surface-0
      hover:border-default
    `,"empty-state":o`
      bg-surface-1
      text-center
    `,elevated:o`
      bg-surface-1
      border border-subtle
      rounded-xl
      p-4 sm:p-6
      transition-[background-color,border-color] ${s.slow} ${s.easing}
    `,floating:o`
      bg-surface-1
      border border-subtle
      rounded-xl
      p-4 sm:p-6
      transition-[background-color,border-color] ${s.slow} ${s.easing}
    `,onboarding:o`
      relative
      bg-surface-1
      border border-subtle
      rounded-2xl
      transition-[background-color,border-color] ${s.slow} ${s.easing}
    `,feature:o`
      bg-surface-1
      border border-subtle
      rounded-2xl
      p-6 sm:p-8
      transition-[background-color,border-color] ${s.slow} ${s.easing}
      hover:border-default
    `,compact:o`
      bg-surface-1
      rounded-lg
      p-4
      transition-[background-color,border-color]
    `,ghost:o`
      rounded-xl
      p-6
      transition-[background-color,border-color] ${s.normal} ${s.easing}
      hover:bg-interactive-hover
    `}}})))()}function u({variant:e=`default`,children:t,className:n,onClick:i,hover:a=!0,padding:o,...s}){let l=i?`button`:`div`,u=o??f[e];return(0,d.jsx)(l,{className:r(c.base,c.padding[u],c.variants[e],!a&&e===`interactive`&&`hover:shadow-none hover:transform-none hover:ring-0 hover:border-subtle hover:bg-surface-1`,n),onClick:i,type:i?`button`:void 0,...s,children:t})}var d,f;function p(){return(p=e((()=>{d=t(),n(),l(),f={default:`default`,interactive:`default`,settings:`none`,analytics:`compact`,"empty-state":`large`,onboarding:`default`}})))()}export{p as n,u as t};
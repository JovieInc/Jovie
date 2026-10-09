import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";function n(e,t){return((e+1)*1664525+t*1013904223>>>0)/4294967296}function r(e=s,t=c){return Array.from({length:e},(e,r)=>({id:`confetti-${r}`,width:4+n(r,1)*6,height:4+n(r,2)*6,color:t[r%t.length],left:`${n(r,3)*100}%`,opacity:.9,animationDelay:`${n(r,4)*.8}s`,animationDuration:`${2+n(r,5)*2}s`,rotation:`rotate(${n(r,6)*360}deg)`}))}function i(){return(0,o.jsx)(`style`,{children:`
      @keyframes confetti-fall {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
      .${l} {
        animation: confetti-fall ease-out forwards;
      }
    `})}function a({count:e=s,colors:t=c,viewport:n=!1}={}){let a=r(e,t);return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)(`div`,{className:n?`pointer-events-none fixed inset-0 overflow-hidden`:`pointer-events-none absolute inset-0 overflow-hidden`,"aria-hidden":`true`,children:a.map(e=>(0,o.jsx)(`span`,{className:`absolute block rounded-sm ${l}`,style:{width:`${e.width}px`,height:`${e.height}px`,backgroundColor:e.color,left:e.left,top:`-10px`,opacity:e.opacity,animationDelay:e.animationDelay,animationDuration:e.animationDuration,transform:e.rotation}},e.id))}),(0,o.jsx)(i,{})]})}var o,s,c,l;function u(){return(u=e((()=>{o=t(),s=40,c=[`var(--color-accent)`,`var(--color-success)`,`var(--color-warning)`,`var(--color-info)`,`var(--color-accent-blue)`],l=`confetti-particle`})))()}export{u as n,a as t};
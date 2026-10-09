import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{Ta as t,Ti as n,d as r,fi as i,ii as a,l as o,mi as s,pi as c,r as l,t as u,vi as d,w as f,wa as p}from"./library-CVP6ZfQZ.js";import{c as m,l as h,n as g,r as _}from"./profile-visibility-DitFXhxw.js";function v(e,t,n){let r=n??new Date;if(!e)return`mystery`;let i=new Date(e);if(Number.isNaN(i.getTime()))return`mystery`;if(i<=r)return`released`;if(!t)return`mystery`;let a=new Date(t);return Number.isNaN(a.getTime())||a>r?`mystery`:`revealed`}function y(){return(y=e((()=>{})))()}function b(e){return typeof e==`string`&&e.trim().length>0}function x(e,t=new Date,n={}){if(!e||e.deletedAt||e.status===`draft`)return!1;let r=e.approvalStatus;return r!==void 0&&!h(r)||!_(e.profileVisibility)||!b(e.artworkUrl)||n.requireProviderLinks&&e.hasProviderLinks!==!0?!1:v(e.releaseDate,e.revealDate,t)!==`mystery`}function S(e=t`NOW()`){return a(s(o.deletedAt),d(o.status,`draft`),c(o.releaseDate),t`NULLIF(BTRIM(${o.artworkUrl}), '') IS NOT NULL`,n(t`${o.releaseDate} <= ${e}`,a(c(o.revealDate),t`${o.revealDate} <= ${e}`)),t`EXISTS (
      SELECT 1
      FROM ${f}
      WHERE ${f.releaseId} = ${o.id}
        AND ${f.ownerType} = 'release'
        AND NULLIF(BTRIM(${f.url}), '') IS NOT NULL
    )`,t`EXISTS (
      SELECT 1
      FROM ${l}
      WHERE ${l.assetId} = ${o.id}::text
        AND ${l.creatorProfileId} = ${o.creatorProfileId}
        AND ${l.approvalStatus} = 'approved'
        AND ${l.profileVisibility} = 'visible'
    )`)}function C(){return(C=e((()=>{i(),p(),r(),u(),m(),g()})))()}export{y as a,v as i,x as n,S as r,C as t};
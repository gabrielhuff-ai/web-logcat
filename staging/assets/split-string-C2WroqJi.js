import{T as a}from"./index-DfQ_RKLG.js";const o=globalThis,d=o.TextDecoderStream;class m extends a{constructor(i){let t;super({transform(e,n){t&&(e=t+e,t=void 0);let r=0;for(;r<e.length;){const s=e.indexOf(i,r);if(s===-1){t=e.substring(r);break}n.enqueue(e.substring(r,s)),r=s+1}},flush(e){t&&e.enqueue(t)}})}}export{m as S,d as T};
//# sourceMappingURL=split-string-C2WroqJi.js.map

import{A as H,h as Te,a as le,S as k}from"./h265-BjZgMYU9.js";import{g as me,S as pe}from"./sticky-event-emitter-Bz3ZVQMU.js";import{g as ge}from"./index-DGTe7z3k.js";function ee(h){return h.toString(16).toUpperCase()}function O(h){return h.toString(16).toUpperCase().padStart(2,"0")}function W(h){return h.toString(10).padStart(2,"0")}class Re{#e;#t;#i;#r;#a=!1;constructor(r,i,t){this.#e=r,this.#t=i,this.#i=t}#n(r){const t=new H(r).searchSequenceHeaderObu();if(!t)return;const{seq_profile:a,seq_level_idx:[e=0],max_frame_width_minus_1:u,max_frame_height_minus_1:d,color_config:{BitDepth:f,mono_chrome:R,subsampling_x:l,subsampling_y:x,chroma_sample_position:m,color_description_present_flag:c}}=t;let p,g,w,b;c?{color_primaries:p,transfer_characteristics:g,matrix_coefficients:w,color_range:b}=t.color_config:(p=H.ColorPrimaries.Bt709,g=H.TransferCharacteristics.Bt709,w=H.MatrixCoefficients.Bt709,b=!1);const F=u+1,C=d+1;this.#t(F,C);const P=["av01",a.toString(16),W(e)+(t.seq_tier[0]?"H":"M"),W(f),R?"1":"0",(l?"1":"0")+(x?"1":"0")+m.toString(),W(p),W(g),W(w),b?"1":"0"].join(".");this.#r={codec:P,hardwareAcceleration:this.#i?.hardwareAcceleration??"no-preference",optimizeForLatency:!0},this.#a=!1}decode(r){if(r.type!=="configuration"){if(this.#n(r.data),!this.#r)throw new Error("Decoder not configured");r.keyframe&&(this.#e.decodeQueueSize?(this.#e.reset(),this.#e.configure(this.#r),this.#a=!0):this.#a||(this.#e.configure(this.#r),this.#a=!0)),this.#e.decode(new EncodedVideoChunk({type:r.keyframe?"key":"delta",timestamp:0,data:r.data}))}}}class ue{#e;#t;#i=!1;constructor(r){this.#e=r}#r(r,i){this.#e.configure(r),this.#i=!0;const{raw:t}=r,a=new Uint8Array(t.length+i.data.length);a.set(t,0),a.set(i.data,t.length),this.#e.decode(new EncodedVideoChunk({type:"key",timestamp:0,data:a}))}decode(r){if(r.type==="configuration"){this.#t={...this.configure(r.data),raw:r.data},this.#i=!1;return}if(!this.#t)throw new Error("Decoder not configured");if(r.keyframe){if(this.#e.decodeQueueSize){this.#e.reset(),this.#r(this.#t,r);return}if(!this.#i){this.#r(this.#t,r);return}}if(!this.#i){if(r.keyframe===void 0){this.#r(this.#t,r);return}throw new Error("Expect a keyframe but got a delta frame")}this.#e.decode(new EncodedVideoChunk({type:r.keyframe===!1?"delta":"key",timestamp:0,data:r.data}))}}class xe extends ue{#e;#t;constructor(r,i,t){super(r),this.#e=i,this.#t=t}configure(r){const{profileIndex:i,constraintSet:t,levelIndex:a,croppedWidth:e,croppedHeight:u}=Te(r);return this.#e(e,u),{codec:"avc1."+O(i)+O(t)+O(a),hardwareAcceleration:this.#t?.hardwareAcceleration??"no-preference",optimizeForLatency:!0}}}class ve extends ue{#e;#t;constructor(r,i,t){super(r),this.#e=i,this.#t=t}configure(r){const{generalProfileSpace:i,generalProfileIndex:t,generalProfileCompatibilitySet:a,generalTierFlag:e,generalLevelIndex:u,generalConstraintSet:d,croppedWidth:f,croppedHeight:R}=le(r);return this.#e(f,R),{codec:["hev1",["","A","B","C"][i]+t.toString(),ee(me(a,0)),(e?"H":"L")+u.toString(),...Array.from(d,ee)].join("."),codedWidth:f,codedHeight:R,hardwareAcceleration:this.#t?.hardwareAcceleration??"no-preference",optimizeForLatency:!0}}}class _e{#e;#t=new ReadableStream({start:r=>{this.#e=r},pull:r=>{r.enqueue(this.#r())}},{highWaterMark:0});#i=this.#t.getReader();#r;#a=0;#n;constructor(r,i){this.#r=r,this.#n=i}async borrow(){return(await this.#i.read()).value}return(r){this.#a<this.#n&&(this.#e.enqueue(r),this.#a+=1)}}class Ae{#e;#t;constructor(){typeof OffscreenCanvas<"u"?this.#e=new OffscreenCanvas(1,1):(this.#e=document.createElement("canvas"),this.#e.width=1,this.#e.height=1),this.#t=this.#e.getContext("bitmaprenderer",{alpha:!1})}async capture(r){this.#e.width=r.displayWidth,this.#e.height=r.displayHeight;const i=await createImageBitmap(r);return this.#t.transferFromImageBitmap(i),this.#e instanceof OffscreenCanvas?await this.#e.convertToBlob({type:"image/png"}):new Promise((t,a)=>{this.#e.toBlob(e=>{e?t(e):a(new Error("Failed to convert canvas to blob"))},"image/png")})}}const te=new _e(()=>new Ae,4);class Xe{static get isSupported(){return typeof globalThis.VideoDecoder<"u"}static capabilities={h264:{},h265:{},av1:{}};#e;get codec(){return this.#e}#t;get renderer(){return this.#t}#i;#r;#a;get writable(){return this.#a}#n;#d;#c=0;#T=0;get framesRendered(){return this.#T}#f=0;get framesSkipped(){return this.#f}#l=new pe;get sizeChanged(){return this.#l.event}#m=0;get width(){return this.#m}#p=0;get height(){return this.#p}#s;#E=!1;#o;#h;#g=0;constructor({codec:r,renderer:i,...t}){switch(this.#e=r,this.#t=i,this.#i=t,this.#s=new VideoDecoder({output:a=>{if(this.#h?.close(),this.#h=a.clone(),this.#E){this.#o&&(this.#o.close(),this.#f+=1),this.#o=a;return}this.#x(a)},error:a=>{this.#R(a)}}),this.#e){case k.H264:this.#r=new xe(this.#s,this.#u,this.#i);break;case k.H265:this.#r=new ve(this.#s,this.#u,this.#i);break;case k.AV1:this.#r=new Re(this.#s,this.#u,this.#i);break;default:throw new Error(`Unsupported codec: ${this.#e}`)}this.#a=new ge({start:a=>{this.#n?a.error(this.#n):this.#d=a},write:a=>{this.#r.decode(a)}}),this.#v()}#R(r){if(this.#d)try{this.#d.error(r)}catch{}else this.#n=r}async#x(r){try{if(this.#E=!0,this.#u(r.displayWidth,r.displayHeight),await this.#t.draw(r),this.#c+=1,r.close(),this.#o){const i=this.#o;this.#o=void 0,await this.#x(i)}this.#E=!1}catch(i){this.#R(i)}}#u=(r,i)=>{this.#t.setSize(r,i),this.#m=r,this.#p=i,this.#l.fire({width:r,height:i})};#v=()=>{this.#c>0&&(this.#T+=1,this.#f+=this.#c-1,this.#c=0),this.#g=requestAnimationFrame(this.#v)};async snapshot(){const r=this.#h;if(!r)return;const i=await te.borrow(),t=await i.capture(r);return te.return(i),t}dispose(){cancelAnimationFrame(this.#g),this.#s.state!=="closed"&&this.#s.close(),this.#o?.close(),this.#h?.close()}}var q={exports:{}},V={exports:{}},re;function Z(){return re||(re=1,(function(){function h(r,i){throw new Error("abstract")}h.prototype.drawFrame=function(r){throw new Error("abstract")},h.prototype.clear=function(){throw new Error("abstract")},V.exports=h})()),V.exports}var z={exports:{}},j={exports:{}},$={exports:{}},ie;function we(){return ie||(ie=1,(function(){/**
 * Convert a ratio into a bit-shift count; for instance a ratio of 2
 * becomes a bit-shift of 1, while a ratio of 1 is a bit-shift of 0.
 *
 * @author Brooke Vibber <bvibber@pobox.com>
 * @copyright 2016-2024
 * @license MIT-style
 *
 * @param {number} ratio - the integer ratio to convert.
 * @returns {number} - number of bits to shift to multiply/divide by the ratio.
 * @throws exception if given a non-power-of-two
 */function h(r){for(var i=0,t=r>>1;t!=0;)t=t>>1,i++;if(r!==1<<i)throw"chroma plane dimensions must be power of 2 ratio to luma plane dimensions; got "+r;return i}$.exports=h})()),$.exports}var ae;function Pe(){return ae||(ae=1,(function(){var h=we();/**
 * Basic YCbCr->RGB conversion
 *
 * @author Brooke Vibber <bvibber@pobox.com>
 * @copyright 2014-2024
 * @license MIT-style
 *
 * @param {YUVFrame} buffer - input frame buffer
 * @param {Uint8ClampedArray} output - array to draw RGBA into
 * Assumes that the output array already has alpha channel set to opaque.
 */function r(i,t){var a=i.format.width|0,e=i.format.height|0,u=h(i.format.width/i.format.chromaWidth)|0,d=h(i.format.height/i.format.chromaHeight)|0,f=i.y.bytes,R=i.u.bytes,l=i.v.bytes,x=i.y.stride|0,m=i.u.stride|0,c=i.v.stride|0,p=a<<2,g=0,w=0,b=0,F=0,C=0,P=0,A=0,_=0,D=0,U=0,E=0,S=0,L=0,y=0,X=0,n=0,o=0,s=0;if(u==1&&d==1)for(A=0,_=p,s=0,n=0;n<e;n+=2){for(w=n*x|0,b=w+x|0,F=s*m|0,C=s*c|0,X=0;X<a;X+=2)D=R[F++]|0,U=l[C++]|0,S=(409*U|0)-57088|0,L=(100*D|0)+(208*U|0)-34816|0,y=(516*D|0)-70912|0,E=298*f[w++]|0,t[A]=E+S>>8,t[A+1]=E-L>>8,t[A+2]=E+y>>8,A+=4,E=298*f[w++]|0,t[A]=E+S>>8,t[A+1]=E-L>>8,t[A+2]=E+y>>8,A+=4,E=298*f[b++]|0,t[_]=E+S>>8,t[_+1]=E-L>>8,t[_+2]=E+y>>8,_+=4,E=298*f[b++]|0,t[_]=E+S>>8,t[_+1]=E-L>>8,t[_+2]=E+y>>8,_+=4;A+=p,_+=p,s++}else for(P=0,n=0;n<e;n++)for(o=0,s=n>>d,g=n*x|0,F=s*m|0,C=s*c|0,X=0;X<a;X++)o=X>>u,D=R[F+o]|0,U=l[C+o]|0,S=(409*U|0)-57088|0,L=(100*D|0)+(208*U|0)-34816|0,y=(516*D|0)-70912|0,E=298*f[g++]|0,t[P]=E+S>>8,t[P+1]=E-L>>8,t[P+2]=E+y>>8,P+=4}j.exports={convertYCbCr:r}})()),j.exports}var ne;function Se(){return ne||(ne=1,(function(){var h=Z(),r=Pe();function i(t){var a=this,e=t.getContext("2d"),u=null,d=null,f=null;function R(x,m){u=e.createImageData(x,m);for(var c=u.data,p=x*m*4,g=0;g<p;g+=4)c[g+3]=255}function l(x,m){d=document.createElement("canvas"),d.width=x,d.height=m,f=d.getContext("2d")}return a.drawFrame=function(m){var c=m.format;(t.width!==c.displayWidth||t.height!==c.displayHeight)&&(t.width=c.displayWidth,t.height=c.displayHeight),(u===null||u.width!=c.width||u.height!=c.height)&&R(c.width,c.height),r.convertYCbCr(m,u.data);var p=c.cropWidth!=c.displayWidth||c.cropHeight!=c.displayHeight,g;p?(d||l(c.cropWidth,c.cropHeight),g=f):g=e,g.putImageData(u,-c.cropLeft,-c.cropTop,c.cropLeft,c.cropTop,c.cropWidth,c.cropHeight),p&&e.drawImage(d,0,0,c.displayWidth,c.displayHeight)},a.clear=function(){e.clearRect(0,0,t.width,t.height)},a}i.prototype=Object.create(h.prototype),z.exports=i})()),z.exports}var K={exports:{}},Q,oe;function be(){return oe||(oe=1,Q={vertex:`precision mediump float;

attribute vec2 aPosition;
attribute vec2 aLumaPosition;
attribute vec2 aChromaPosition;
varying vec2 vLumaPosition;
varying vec2 vChromaPosition;
void main() {
    gl_Position = vec4(aPosition, 0, 1);
    vLumaPosition = aLumaPosition;
    vChromaPosition = aChromaPosition;
}
`,fragment:`// inspired by https://github.com/mbebenita/Broadway/blob/master/Player/canvas.js

precision mediump float;

uniform sampler2D uTextureY;
uniform sampler2D uTextureCb;
uniform sampler2D uTextureCr;
varying vec2 vLumaPosition;
varying vec2 vChromaPosition;
void main() {
   // Y, Cb, and Cr planes are uploaded as ALPHA textures.
   float fY = texture2D(uTextureY, vLumaPosition).w;
   float fCb = texture2D(uTextureCb, vChromaPosition).w;
   float fCr = texture2D(uTextureCr, vChromaPosition).w;

   // Premultipy the Y...
   float fYmul = fY * 1.1643828125;

   // And convert that to RGB!
   gl_FragColor = vec4(
     fYmul + 1.59602734375 * fCr - 0.87078515625,
     fYmul - 0.39176171875 * fCb - 0.81296875 * fCr + 0.52959375,
     fYmul + 2.017234375   * fCb - 1.081390625,
     1
   );
}
`,vertexStripe:`precision mediump float;

attribute vec2 aPosition;
attribute vec2 aTexturePosition;
varying vec2 vTexturePosition;

void main() {
    gl_Position = vec4(aPosition, 0, 1);
    vTexturePosition = aTexturePosition;
}
`,fragmentStripe:`// extra 'stripe' texture fiddling to work around IE 11's poor performance on gl.LUMINANCE and gl.ALPHA textures

precision mediump float;

uniform sampler2D uStripe;
uniform sampler2D uTexture;
varying vec2 vTexturePosition;
void main() {
   // Y, Cb, and Cr planes are mapped into a pseudo-RGBA texture
   // so we can upload them without expanding the bytes on IE 11
   // which doesn't allow LUMINANCE or ALPHA textures
   // The stripe textures mark which channel to keep for each pixel.
   // Each texture extraction will contain the relevant value in one
   // channel only.

   float fLuminance = dot(
      texture2D(uStripe, vTexturePosition),
      texture2D(uTexture, vTexturePosition)
   );

   gl_FragColor = vec4(0, 0, 0, fLuminance);
}
`}),Q}var se;function Ce(){return se||(se=1,(function(){var h=Z(),r=be();function i(t){var a=this,e=i.contextForCanvas(t);if(e===null)throw new Error("WebGL unavailable");function u(n,o){var s=e.createShader(n);if(e.shaderSource(s,o),e.compileShader(s),!e.getShaderParameter(s,e.COMPILE_STATUS)){var T=e.getShaderInfoLog(s);throw e.deleteShader(s),new Error("GL shader compilation for "+n+" failed: "+T)}return s}var d,f,R=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),l={},x={},m={},c,p,g,w,b,F,C,P,A,_;function D(n,o){return(!l[n]||o)&&(l[n]=e.createTexture()),l[n]}function U(n,o,s,T,v){var I=!l[n]||o,Y=D(n,o);if(e.activeTexture(e.TEXTURE0),i.stripe){var B=!l[n+"_temp"]||o,M=D(n+"_temp",o);e.bindTexture(e.TEXTURE_2D,M),B?(e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,s/4,T,0,e.RGBA,e.UNSIGNED_BYTE,v)):e.texSubImage2D(e.TEXTURE_2D,0,0,0,s/4,T,e.RGBA,e.UNSIGNED_BYTE,v);var G=l[n+"_stripe"],N=!G||o;N&&(G=D(n+"_stripe",o)),e.bindTexture(e.TEXTURE_2D,G),N&&(e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,s,1,0,e.RGBA,e.UNSIGNED_BYTE,L(s)))}else e.bindTexture(e.TEXTURE_2D,Y),I?(e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.ALPHA,s,T,0,e.ALPHA,e.UNSIGNED_BYTE,v)):e.texSubImage2D(e.TEXTURE_2D,0,0,0,s,T,e.ALPHA,e.UNSIGNED_BYTE,v)}function E(n,o,s,T){var v=l[n];e.useProgram(f);var I=x[n];(!I||o)&&(e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,v),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,s,T,0,e.RGBA,e.UNSIGNED_BYTE,null),I=x[n]=e.createFramebuffer()),e.bindFramebuffer(e.FRAMEBUFFER,I),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,v,0);var Y=l[n+"_temp"];e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,Y),e.uniform1i(F,1);var B=l[n+"_stripe"];e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,B),e.uniform1i(b,2),e.bindBuffer(e.ARRAY_BUFFER,c),e.enableVertexAttribArray(p),e.vertexAttribPointer(p,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,g),e.enableVertexAttribArray(w),e.vertexAttribPointer(w,2,e.FLOAT,!1,0,0),e.viewport(0,0,s,T),e.drawArrays(e.TRIANGLES,0,R.length/2),e.bindFramebuffer(e.FRAMEBUFFER,null)}function S(n,o,s){e.activeTexture(o),e.bindTexture(e.TEXTURE_2D,l[n]),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.uniform1i(e.getUniformLocation(d,n),s)}function L(n){if(m[n])return m[n];for(var o=n,s=new Uint32Array(o),T=0;T<o;T+=4)s[T]=255,s[T+1]=65280,s[T+2]=16711680,s[T+3]=4278190080;return m[n]=new Uint8Array(s.buffer)}function y(n,o){var s=u(e.VERTEX_SHADER,n),T=u(e.FRAGMENT_SHADER,o),v=e.createProgram();if(e.attachShader(v,s),e.attachShader(v,T),e.linkProgram(v),!e.getProgramParameter(v,e.LINK_STATUS)){var I=e.getProgramInfoLog(v);throw e.deleteProgram(v),new Error("GL program linking failed: "+I)}return v}function X(){if(i.stripe){f=y(r.vertexStripe,r.fragmentStripe),e.getAttribLocation(f,"aPosition"),g=e.createBuffer();var n=new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]);e.bindBuffer(e.ARRAY_BUFFER,g),e.bufferData(e.ARRAY_BUFFER,n,e.STATIC_DRAW),w=e.getAttribLocation(f,"aTexturePosition"),b=e.getUniformLocation(f,"uStripe"),F=e.getUniformLocation(f,"uTexture")}d=y(r.vertex,r.fragment),c=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,c),e.bufferData(e.ARRAY_BUFFER,R,e.STATIC_DRAW),p=e.getAttribLocation(d,"aPosition"),C=e.createBuffer(),P=e.getAttribLocation(d,"aLumaPosition"),A=e.createBuffer(),_=e.getAttribLocation(d,"aChromaPosition")}return a.drawFrame=function(n){var o=n.format,s=!d||t.width!==o.displayWidth||t.height!==o.displayHeight;if(s&&(t.width=o.displayWidth,t.height=o.displayHeight,a.clear()),d||X(),s){var T=function(v,I,Y){var B=o.cropLeft/Y,M=(o.cropLeft+o.cropWidth)/Y,G=(o.cropTop+o.cropHeight)/o.height,N=o.cropTop/o.height,Ee=new Float32Array([B,G,M,G,B,N,B,N,M,G,M,N]);e.bindBuffer(e.ARRAY_BUFFER,v),e.bufferData(e.ARRAY_BUFFER,Ee,e.STATIC_DRAW)};T(C,P,n.y.stride),T(A,_,n.u.stride*o.width/o.chromaWidth)}U("uTextureY",s,n.y.stride,o.height,n.y.bytes),U("uTextureCb",s,n.u.stride,o.chromaHeight,n.u.bytes),U("uTextureCr",s,n.v.stride,o.chromaHeight,n.v.bytes),i.stripe&&(E("uTextureY",s,n.y.stride,o.height),E("uTextureCb",s,n.u.stride,o.chromaHeight),E("uTextureCr",s,n.v.stride,o.chromaHeight)),e.useProgram(d),e.viewport(0,0,t.width,t.height),S("uTextureY",e.TEXTURE0,0),S("uTextureCb",e.TEXTURE1,1),S("uTextureCr",e.TEXTURE2,2),e.bindBuffer(e.ARRAY_BUFFER,c),e.enableVertexAttribArray(p),e.vertexAttribPointer(p,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,C),e.enableVertexAttribArray(P),e.vertexAttribPointer(P,2,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,A),e.enableVertexAttribArray(_),e.vertexAttribPointer(_,2,e.FLOAT,!1,0,0),e.drawArrays(e.TRIANGLES,0,R.length/2)},a.clear=function(){e.viewport(0,0,t.width,t.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT)},a.clear(),a}i.stripe=!1,i.contextForCanvas=function(t){var a={preferLowPowerToHighPerformance:!0,powerPreference:"low-power",failIfMajorPerformanceCaveat:!0,preserveDrawingBuffer:!0};return t.getContext("webgl",a)||t.getContext("experimental-webgl",a)},i.isAvailable=function(){var t=document.createElement("canvas"),a;t.width=1,t.height=1;try{a=i.contextForCanvas(t)}catch{return!1}if(a){var e=a.TEXTURE0,u=4,d=4,f=a.createTexture(),R=new Uint8Array(u*d),l=i.stripe?u/4:u,x=i.stripe?a.RGBA:a.ALPHA,m=i.stripe?a.NEAREST:a.LINEAR;a.activeTexture(e),a.bindTexture(a.TEXTURE_2D,f),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,m),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,m),a.texImage2D(a.TEXTURE_2D,0,x,l,d,0,x,a.UNSIGNED_BYTE,R);var c=a.getError();return!c}else return!1},i.prototype=Object.create(h.prototype),K.exports=i})()),K.exports}var ce;function De(){return ce||(ce=1,(function(){var h=Z(),r=Se(),i=Ce(),t={FrameSink:h,SoftwareFrameSink:r,WebGLFrameSink:i,attach:function(a,e){e=e||{};var u="webGL"in e?e.webGL:i.isAvailable();return u?new i(a,e):new r(a,e)}};q.exports=t})()),q.exports}De();function de(){if(typeof document<"u")return document.createElement("canvas");if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(1,1);throw new Error("no canvas input found nor any canvas can be created")}class fe{#e;get canvas(){return this.#e}constructor(r){r?this.#e=r:this.#e=de()}setSize(r,i){(this.#e.width!==r||this.#e.height!==i)&&(this.#e.width=r,this.#e.height=i)}}class Ie extends fe{#e;constructor(r){super(r),this.#e=this.canvas.getContext("bitmaprenderer",{alpha:!1})}async draw(r){const i=await createImageBitmap(r);this.#e.transferFromImageBitmap(i)}}class Be{static get isSupported(){return typeof MediaStreamTrackGenerator<"u"}#e;get element(){return this.#e}#t;#i;#r;constructor(r){if(r)this.#e=r;else if(typeof document<"u")this.#e=document.createElement("video");else throw new Error("no video element input found nor any video element can be created");this.#e.muted=!0,this.#e.autoplay=!0,this.#e.disablePictureInPicture=!0,this.#e.disableRemotePlayback=!0,this.#t=new MediaStreamTrackGenerator({kind:"video"}),this.#i=this.#t.writable.getWriter(),this.#r=new MediaStream([this.#t]),this.#e.srcObject=this.#r}setSize(r,i){(this.#e.width!==r||this.#e.height!==i)&&(this.#e.width=r,this.#e.height=i)}async draw(r){await this.#i.write(r)}}const Ue=Promise.resolve();function he(h,r){const i={powerPreference:"low-power",alpha:!1,failIfMajorPerformanceCaveat:!0,preserveDrawingBuffer:!!r};return h.getContext("webgl2",i)||h.getContext("webgl",i)}class J extends fe{static vertexShaderSource=`
        attribute vec2 xy;

        varying highp vec2 uv;

        void main(void) {
            gl_Position = vec4(xy, 0.0, 1.0);
            // Map vertex coordinates (-1 to +1) to UV coordinates (0 to 1).
            // UV coordinates are Y-flipped relative to vertex coordinates.
            uv = vec2((1.0 + xy.x) / 2.0, (1.0 - xy.y) / 2.0);
        }
`;static fragmentShaderSource=`
        varying highp vec2 uv;

        uniform sampler2D texture;

        void main(void) {
            gl_FragColor = texture2D(texture, uv);
        }
`;static get isSupported(){const r=de();return!!he(r)}#e;constructor(r,i){super(r);const t=he(this.canvas,i);if(!t)throw new Error("WebGL not supported");this.#e=t;const a=t.createShader(t.VERTEX_SHADER);if(t.shaderSource(a,J.vertexShaderSource),t.compileShader(a),!t.getShaderParameter(a,t.COMPILE_STATUS))throw new Error(t.getShaderInfoLog(a));const e=t.createShader(t.FRAGMENT_SHADER);if(t.shaderSource(e,J.fragmentShaderSource),t.compileShader(e),!t.getShaderParameter(e,t.COMPILE_STATUS))throw new Error(t.getShaderInfoLog(e));const u=t.createProgram();if(t.attachShader(u,a),t.attachShader(u,e),t.linkProgram(u),!t.getProgramParameter(u,t.LINK_STATUS))throw new Error(t.getProgramInfoLog(u));t.useProgram(u);const d=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,d),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,-1,1,1,1,1,-1]),t.STATIC_DRAW);const f=t.getAttribLocation(u,"xy");t.vertexAttribPointer(f,2,t.FLOAT,!1,0,0),t.enableVertexAttribArray(f);const R=t.createTexture();t.bindTexture(t.TEXTURE_2D,R),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.NEAREST),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE)}draw(r){const i=this.#e;return i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,r),i.viewport(0,0,i.drawingBufferWidth,i.drawingBufferHeight),i.drawArrays(i.TRIANGLE_FAN,0,4),Ue}}export{Re as Av1Codec,Ie as BitmapVideoFrameRenderer,fe as CanvasVideoFrameRenderer,xe as H264Decoder,ve as H265Decoder,ue as H26xDecoder,Be as InsertableStreamVideoFrameRenderer,Xe as WebCodecsVideoDecoder,J as WebGLVideoFrameRenderer,W as decimalTwoDigits,ee as hexDigits,O as hexTwoDigits};
//# sourceMappingURL=index-BRK-FsaC.js.map

var openbridgeContent=(function(){"use strict";var g=Object.defineProperty;var m=(n,o,c)=>o in n?g(n,o,{enumerable:!0,configurable:!0,writable:!0,value:c}):n[o]=c;var h=(n,o,c)=>m(n,typeof o!="symbol"?o+"":o,c);function n(e){return e}class o{constructor(){h(this,"host");h(this,"shadow");h(this,"cursor");this.host=document.createElement("div"),this.host.id="openbridge-cursor",this.shadow=this.host.attachShadow({mode:"closed"});const t=document.createElement("style");t.textContent=`
      .cursor {
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(59, 130, 246, 0.9);
        background: rgba(59, 130, 246, 0.3);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.15s ease-out, background 0.15s ease-out, border-color 0.15s ease-out;
        top: 0;
        left: 0;
        display: none;
      }
      .cursor.clicking {
        transform: translate(-50%, -50%) scale(1.6);
        background: rgba(34, 197, 94, 0.4);
        border-color: rgba(34, 197, 94, 0.9);
      }
    `,this.cursor=document.createElement("div"),this.cursor.className="cursor",this.shadow.appendChild(t),this.shadow.appendChild(this.cursor),document.body.appendChild(this.host)}show(t,s){this.cursor.style.left=`${t}px`,this.cursor.style.top=`${s}px`,this.cursor.style.display="block"}click(t,s){this.show(t,s),this.cursor.classList.add("clicking"),setTimeout(()=>{this.cursor.classList.remove("clicking")},300)}hide(){this.cursor.style.display="none"}destroy(){this.host.remove()}}class c{constructor(){h(this,"host");h(this,"shadow");h(this,"highlights",[]);this.host=document.createElement("div"),this.host.id="openbridge-highlighter",this.shadow=this.host.attachShadow({mode:"closed"});const t=document.createElement("style");t.textContent=`
      .highlight {
        position: fixed;
        pointer-events: none;
        z-index: 2147483646;
        outline: 2px solid rgba(59, 130, 246, 0.8);
        background: rgba(59, 130, 246, 0.15);
        border-radius: 2px;
      }
    `,this.shadow.appendChild(t),document.body.appendChild(this.host)}highlight(t){const s=document.querySelector(t);s&&this.highlightElement(s)}highlightRef(t){const s=document.querySelector(`[data-openbridge-ref="${t}"]`);s&&this.highlightElement(s)}highlightElement(t){const s=t.getBoundingClientRect(),i=document.createElement("div");i.className="highlight",i.style.top=`${s.top}px`,i.style.left=`${s.left}px`,i.style.width=`${s.width}px`,i.style.height=`${s.height}px`,this.shadow.appendChild(i),this.highlights.push(i)}clear(){for(const t of this.highlights)t.remove();this.highlights=[]}destroy(){this.clear(),this.host.remove()}}const d={matches:["<all_urls>"],runAt:"document_idle",main(){const e=new o,t=new c;chrome.runtime.onMessage.addListener((s,i,l)=>{const r=s;switch(r.type){case"showCursor":{r.x!=null&&r.y!=null&&e.show(r.x,r.y),l({success:!0});break}case"clickCursor":{r.x!=null&&r.y!=null&&e.click(r.x,r.y),l({success:!0});break}case"hideCursor":{e.hide(),l({success:!0});break}case"highlightElement":{r.selector?t.highlight(r.selector):r.ref&&t.highlightRef(r.ref),l({success:!0});break}case"clearHighlights":{t.clear(),l({success:!0});break}default:l({error:"Unknown message type"})}return!1}),window.addEventListener("unload",()=>{e.destroy(),t.destroy()})}};function p(){}function a(e,...t){}const u={debug:(...e)=>a(console.debug,...e),log:(...e)=>a(console.log,...e),warn:(...e)=>a(console.warn,...e),error:(...e)=>a(console.error,...e)};return(async()=>{try{return await d.main()}catch(e){throw u.error('The unlisted script "openbridge-content" crashed on startup!',e),e}})()})();
openbridgeContent;

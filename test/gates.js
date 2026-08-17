const fs=require("fs"),{JSDOM}=require("jsdom");
const html=fs.readFileSync("C:/Users/wessi/business/relay/index.html","utf8");
const errs=[];let pass=0,fail=0;
const ok=(l,c,x)=>{c?pass++:fail++;console.log((c?" PASS  ":"*FAIL* ")+l+(x!==undefined?"  -> "+x:""))};
const dom=new JSDOM(html,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://westonhughes07-ux.github.io/relay/"});
const w=dom.window,d=w.document;
w.onerror=m=>errs.push("onerror: "+m); console.error=(...a)=>errs.push("console.error: "+a.join(" "));
w.HTMLElement.prototype.animate=w.HTMLElement.prototype.animate||function(){return{onfinish:null,effect:{target:this}}};
if(!w.navigator.vibrate)Object.defineProperty(w.navigator,"vibrate",{value:()=>true});
let copied=null;Object.defineProperty(w.navigator,"clipboard",{value:{writeText:t=>{copied=t;return Promise.resolve()}}});

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
const D=[{b:1,dx:0,dy:-1,o:4},{b:2,dx:1,dy:0,o:8},{b:4,dx:0,dy:1,o:1},{b:8,dx:-1,dy:0,o:2}];
const rot=(m,k)=>{k=((k%4)+4)%4;for(let i=0;i<k;i++)m=((m<<1)|(m>>3))&15;return m};
function gen(seed,N){const rnd=mulberry32(hash(seed)),ri=n=>Math.floor(rnd()*n),ix=(x,y)=>y*N+x;
  const S=new Array(N*N).fill(0),sx=(N-1)>>1,sy=(N-1)>>1,src=ix(sx,sy);
  const seen=new Array(N*N).fill(false),st=[[sx,sy]];seen[src]=true;
  while(st.length){const[x,y]=st[st.length-1],o=[];
    for(let i=0;i<4;i++){const dd=D[i],nx=x+dd.dx,ny=y+dd.dy;
      if(nx<0||ny<0||nx>=N||ny>=N)continue;if(seen[ix(nx,ny)])continue;o.push(i)}
    if(!o.length){st.pop();continue}
    const p=D[o[ri(o.length)]],ax=x+p.dx,ay=y+p.dy;
    S[ix(x,y)]|=p.b;S[ix(ax,ay)]|=p.o;seen[ix(ax,ay)]=true;st.push([ax,ay])}
  const base=new Array(N*N);let par=0;
  for(let c=0;c<N*N;c++)base[c]=rot(S[c],ri(4));
  for(let c=0;c<N*N;c++){let m=4;for(let k=0;k<4;k++)if(rot(base[c],k)===S[c])m=Math.min(m,k);par+=(m===4?0:m)}
  return{S,base,par}}
const utc=(()=>{const n=new Date();return Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate())})();
const key=new Date(utc).toISOString().slice(0,10);
const REF=gen("relay-"+key,7);
const click=el=>{const e=new w.MouseEvent("pointerdown",{bubbles:true,cancelable:true});Object.defineProperty(e,"button",{value:0});el.dispatchEvent(e)};

setTimeout(()=>{
 const board=d.getElementById("board");
 console.log("\n--- STRUCTURE ---");
 ok("grid contains only cells (no FX nodes)", board.children.length===49, board.children.length);
 ok("FX overlay is a sibling, not a grid child", !!d.getElementById("fx") && d.getElementById("fx").parentNode!==board);
 ok("all cells render SVG", [...board.children].every(c=>c.querySelector("svg")));
 ok("exactly one source tile", [...board.children].filter(c=>c.classList.contains("src")).length===1);

 console.log("\n--- SPEC AGREEMENT ---");
 ok("par matches independent implementation", parseInt(d.getElementById("pr").textContent,10)===REF.par, d.getElementById("pr").textContent+" vs "+REF.par);

 console.log("\n--- ARCHIVE BOUNDS (day 1) ---");
 const at=d.querySelector('[data-mode="archive"]');
 ok("archive tab disabled with no history", at.disabled===true, "title: "+at.title);
 at.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
 ok("clicking archive stays on Daily", d.querySelector('[data-mode="daily"]').classList.contains("on"), "active tab: "+[...d.querySelectorAll(".tab")].filter(t=>t.classList.contains("on")).map(t=>t.dataset.mode));
 ok("no pre-epoch board served", d.getElementById("pno").textContent==="1", "No."+d.getElementById("pno").textContent);

 console.log("\n--- ENDLESS ---");
 d.querySelector('[data-mode="endless"]').dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
 const n1=board.children.length;
 ok("endless builds a valid square grid", [25,49,81].includes(n1), n1+" cells / "+d.getElementById("gridLabel").textContent);
 ok("endless par is positive", parseInt(d.getElementById("pr").textContent,10)>0, d.getElementById("pr").textContent);

 console.log("\n--- OPTIMAL SOLVE (daily) ---");
 d.querySelector('[data-mode="daily"]').dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
 const cells=[...board.children];
 for(let c=0;c<49;c++){let m=4;for(let k=0;k<4;k++)if(rot(REF.base[c],k)===REF.S[c])m=Math.min(m,k);if(m===4)m=0;
   for(let k=0;k<m;k++)click(cells[c])}
 ok("board fully lit", d.getElementById("lc").textContent==="49", d.getElementById("lc").textContent+"/49");
 ok("moves equal par exactly (par is achievable)", d.getElementById("mv").textContent===String(REF.par), d.getElementById("mv").textContent+" vs "+REF.par);
 ok("progress meter at 100%", d.getElementById("meter").style.width==="100%", d.getElementById("meter").style.width);

 setTimeout(()=>{
  ok("win modal opens", d.getElementById("win").classList.contains("on"));
  ok("streak recorded", d.getElementById("ws").textContent==="1", d.getElementById("ws").textContent);
  d.getElementById("share").dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  setTimeout(()=>{
   console.log("\n--- SHARE CARD ---");
   console.log(copied);
   ok("share reveals no tile/board data", copied && !/mask|solved|solution|\b[0-9]{6,}\b/.test(copied));
   ok("share includes score + par", copied.includes("par"));
   const s=JSON.parse(w.localStorage.getItem("relay.v2")||"{}");
   ok("stats persisted", s.solved===1&&s.streak===1&&s.best===0, JSON.stringify({solved:s.solved,streak:s.streak,best:s.best}));
   console.log("\n--- RUNTIME ---");
   ok("no JS errors", errs.length===0, errs.slice(0,3).join(" | ")||"clean");
   console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
   process.exit(fail?1:0);
  },250);
 },900);
},1500);

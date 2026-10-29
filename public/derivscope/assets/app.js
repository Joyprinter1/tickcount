(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))i(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const c of r.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&i(c)}).observe(document,{childList:!0,subtree:!0});function a(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function i(s){if(s.ep)return;s.ep=!0;const r=a(s);fetch(s.href,r)}})();const ne="wss://api.derivws.com/trading/v1/options/ws/public",ae=12e3,oe={random_index:"Volatility Indices",crash_index:"Boom & Crash Indices",jump_index:"Jump Indices",range_index:"Range Break Indices",step_index:"Step Indices",random_daily:"Daily Indices",forex_basket:"Forex Baskets",commodity_basket:"Commodity Baskets"};function ce(t){const e=Number(t);return!Number.isFinite(e)||e<=0?2:Math.max(0,Math.min(8,Math.round(-Math.log10(e))))}function le(){return new Promise((t,e)=>{let a,i=!1;const s=(c,m)=>{i||(i=!0,clearTimeout(r),a&&a.readyState<WebSocket.CLOSING&&a.close(),c?e(c):t(m))},r=setTimeout(()=>s(new Error("Timed out loading Deriv’s active synthetic markets.")),ae);try{a=new WebSocket(ne)}catch(c){s(c instanceof Error?c:new Error("Could not connect to Deriv’s market catalog."));return}a.addEventListener("open",()=>{a.send(JSON.stringify({active_symbols:"full",req_id:10}))}),a.addEventListener("message",c=>{let m;try{m=JSON.parse(c.data)}catch{s(new Error("Deriv returned an unreadable synthetic-market catalog."));return}if(m.error){s(new Error(m.error.message||"Deriv could not return active markets."));return}if(m.msg_type!=="active_symbols"&&!Array.isArray(m.active_symbols))return;const d=(m.active_symbols||[]).filter(o=>o.market==="synthetic_index"&&o.underlying_symbol).map(o=>({code:o.underlying_symbol,label:String(o.underlying_symbol_name||o.underlying_symbol).replace(/ Index$/,""),precision:ce(o.pip_size),category:o.submarket||"other",categoryLabel:oe[o.submarket]||"Other Synthetic Indices",isOpen:!!o.exchange_is_open,suspended:!!o.is_trading_suspended})).sort((o,u)=>o.categoryLabel.localeCompare(u.categoryLabel)||o.label.localeCompare(u.label));if(!d.length){s(new Error("Deriv did not return any active synthetic-index markets."));return}s(null,d)}),a.addEventListener("error",()=>s(new Error("Could not reach Deriv’s active-market service.")))})}function de({symbol:t,onStatus:e,onHistory:a,onTick:i,onError:s}){let r=!1,c,m=null;const d=()=>{m!==null&&clearTimeout(m),m=null},o=h=>{r||(d(),s(h),c&&[WebSocket.CONNECTING,WebSocket.OPEN].includes(c.readyState)&&c.close())},u=h=>{d(),m=setTimeout(()=>o(h),ae)};try{c=new WebSocket(ne)}catch(h){return s(h instanceof Error?h.message:"Could not open the Deriv data connection."),{close(){}}}return u("Timed out connecting to Deriv’s public market-data feed."),c.addEventListener("open",()=>{e("syncing"),c.send(JSON.stringify({ticks_history:t,count:1e3,end:"latest",style:"ticks",req_id:1})),u("Timed out waiting for Deriv tick history.")}),c.addEventListener("message",h=>{let p;try{p=JSON.parse(h.data)}catch{o("Received an unreadable response from Deriv’s public feed.");return}if(p.error){o(p.error.message||"Deriv returned a market-data error.");return}if(p.msg_type==="history"&&p.history){a({prices:p.history.prices||[],times:p.history.times||[],precision:p.pip_size}),e("subscribing"),c.send(JSON.stringify({ticks:t,subscribe:1,req_id:2})),u("Timed out waiting for the first live Deriv tick.");return}if(p.msg_type==="tick"&&p.tick){if(i({quote:Number(p.tick.quote),epoch:Number(p.tick.epoch),precision:p.tick.pip_size}),r)return;e("live"),u("No Deriv tick update was received for 12 seconds.")}}),c.addEventListener("error",()=>{o("Could not reach Deriv’s public market-data feed.")}),c.addEventListener("close",()=>{d(),r||e("disconnected")}),{close(){r=!0,d(),(c.readyState===WebSocket.OPEN||c.readyState===WebSocket.CONNECTING)&&c.close()}}}const ue=[15,30,60,120];function me({prices:t,times:e,precision:a,windowSeconds:i,nowEpoch:s=Math.floor(Date.now()/1e3)}){const r=Array(10).fill(0),c=s-i,m=Math.min(t.length,e.length);let d=0,o=null,u=null;const h=[];for(let g=0;g<m;g+=1){const v=Number(e[g]),P=Number(t[g]);if(!Number.isFinite(v)||!Number.isFinite(P)||v<c||v>s+2)continue;const W=Number(P.toFixed(a).at(-1));!Number.isInteger(W)||W<0||W>9||(r[W]+=1,d+=1,o=o===null?v:Math.min(o,v),u=u===null?v:Math.max(u,v),h.push(v))}const p=d?r.reduce((g,v,P)=>v>r[g]?P:g,0):null,$=o===null?0:Math.max(0,u-o),y=Math.max(5,Math.ceil(i*.4)),C=[...new Set(h)].sort((g,v)=>g-v),S=C.slice(1).map((g,v)=>g-C[v]),b=[...S].sort((g,v)=>g-v),N=b.length?b[Math.floor(b.length/2)]:0,w=S.length?Math.max(...S):0,x=Math.max(5,N*4),D=w<=x,L=u!==null&&s-u<=5,l=d>=y&&$>=i*.8&&L&&D;return{windowSeconds:i,counts:r,sampleCount:d,minSamples:y,firstEpoch:o,lastEpoch:u,coverageSeconds:$,maxGapSeconds:w,maxAllowedGapSeconds:x,continuityReady:D,fresh:L,bestDigit:p,ready:l,matchRate(g){return d?r[g]/d:null},differRate(g){return d?(d-r[g])/d:null}}}const pe=[["1HZ100V","Volatility 100 (1s)",2,"random_index","Volatility Indices"],["1HZ10V","Volatility 10 (1s)",2,"random_index","Volatility Indices"],["1HZ15V","Volatility 15 (1s)",3,"random_index","Volatility Indices"],["1HZ25V","Volatility 25 (1s)",2,"random_index","Volatility Indices"],["1HZ30V","Volatility 30 (1s)",3,"random_index","Volatility Indices"],["1HZ50V","Volatility 50 (1s)",2,"random_index","Volatility Indices"],["1HZ75V","Volatility 75 (1s)",2,"random_index","Volatility Indices"],["1HZ90V","Volatility 90 (1s)",3,"random_index","Volatility Indices"],["R_10","Volatility 10",3,"random_index","Volatility Indices"],["R_100","Volatility 100",2,"random_index","Volatility Indices"],["R_25","Volatility 25",3,"random_index","Volatility Indices"],["R_50","Volatility 50",4,"random_index","Volatility Indices"],["R_75","Volatility 75",4,"random_index","Volatility Indices"],["BOOM1000","Boom 1000",3,"crash_index","Boom & Crash Indices"],["BOOM150N","Boom 150",5,"crash_index","Boom & Crash Indices"],["BOOM300N","Boom 300",3,"crash_index","Boom & Crash Indices"],["BOOM50","Boom 50",3,"crash_index","Boom & Crash Indices"],["BOOM500","Boom 500",3,"crash_index","Boom & Crash Indices"],["BOOM600","Boom 600",3,"crash_index","Boom & Crash Indices"],["BOOM900","Boom 900",3,"crash_index","Boom & Crash Indices"],["CRASH1000","Crash 1000",3,"crash_index","Boom & Crash Indices"],["CRASH150N","Crash 150",5,"crash_index","Boom & Crash Indices"],["CRASH300N","Crash 300",3,"crash_index","Boom & Crash Indices"],["CRASH50","Crash 50",3,"crash_index","Boom & Crash Indices"],["CRASH500","Crash 500",3,"crash_index","Boom & Crash Indices"],["CRASH600","Crash 600",3,"crash_index","Boom & Crash Indices"],["CRASH900","Crash 900",3,"crash_index","Boom & Crash Indices"],["JD10","Jump 10",2,"jump_index","Jump Indices"],["JD100","Jump 100",2,"jump_index","Jump Indices"],["JD25","Jump 25",2,"jump_index","Jump Indices"],["JD50","Jump 50",2,"jump_index","Jump Indices"],["JD75","Jump 75",2,"jump_index","Jump Indices"],["RB100","Range Break 100",1,"range_index","Range Break Indices"],["RB200","Range Break 200",1,"range_index","Range Break Indices"],["RDBEAR","Bear Market",4,"random_daily","Daily Indices"],["RDBULL","Bull Market",4,"random_daily","Daily Indices"],["WLDAUD","AUD Basket",3,"forex_basket","Forex Baskets"],["WLDEUR","EUR Basket",3,"forex_basket","Forex Baskets"],["WLDGBP","GBP Basket",3,"forex_basket","Forex Baskets"],["WLDUSD","USD Basket",3,"forex_basket","Forex Baskets"],["WLDXAU","Gold Basket",3,"commodity_basket","Commodity Baskets"],["stpRNG","Step Index 100",1,"step_index","Step Indices"],["stpRNG2","Step Index 200",1,"step_index","Step Indices"],["stpRNG3","Step Index 300",1,"step_index","Step Indices"],["stpRNG4","Step Index 400",1,"step_index","Step Indices"],["stpRNG5","Step Index 500",1,"step_index","Step Indices"]].map(([t,e,a,i,s])=>({code:t,label:e,precision:a,category:i,categoryLabel:s}));let k=Object.fromEntries(pe.map(t=>[t.code,t]));const M={matchesDiffers:"Matches / Differs",evenOdd:"Even / Odd",overUnder:"Over / Under",riseFall:"Rise / Fall",continuation:"Only Ups / Only Downs"},n={market:"1HZ10V",ticks:[],times:[],precision:k["1HZ10V"].precision,connection:"connecting",connectionError:"",isLive:!0,barrier:5,digitTarget:"auto",scanWindowSeconds:15,marketCatalogLoading:!0,marketCatalogError:"",range:30,overlay:"trend",scanType:"auto",threshold:70,toast:"",signalHistory:[]};let I=null,T=0,F=null,R=!1,U=!1,E=null,Y=!1,J=0;const A=(t,e,a)=>Math.max(e,Math.min(a,t)),z=t=>t.length?t.reduce((e,a)=>e+a,0)/t.length:0,H=t=>Number(t).toLocaleString("en-US",{minimumFractionDigits:n.precision,maximumFractionDigits:n.precision}),O=t=>String(t).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]);function se(t=n.scanWindowSeconds){return me({prices:n.ticks,times:n.times,precision:n.precision,windowSeconds:t})}function ie(t){return n.digitTarget==="auto"?t.bestDigit:Number(n.digitTarget)}function Q(t){return Number(Number(t).toFixed(n.precision).at(-1))}function X(t,e){if(!t.length)return{count:0,kind:"FLAT"};const a=e(t.at(-1));let i=0;for(let s=t.length-1;s>=0&&e(t[s])===a;s-=1)i+=1;return{count:i,kind:a}}function V(){const t=n.ticks,e=t.slice(-25),a=e.slice(1).map((l,g)=>l-e[g]),i=a.map((l,g)=>l/(e[g]||1)*1e4),s=a.filter(l=>l>0).length,r=a.filter(l=>l<0).length,c=z(i),m=z(i.map(l=>(l-c)**2)),d=t.slice(-100).map(Q).filter(Number.isFinite),o=Array(10).fill(0);d.forEach(l=>{o[l]+=1});const u=d.filter(l=>l%2===0).length,h=d.filter(l=>l<n.barrier).length,p=d.filter(l=>l>n.barrier).length,$=d.filter(l=>l===n.barrier).length,y=X(a,l=>l>0?"UP":l<0?"DOWN":"FLAT"),C=X(d,l=>l%2===0?"EVEN":"ODD"),S=c>0?"RISE":c<0?"FALL":"FLAT",b=Math.max(a.length,1),N=Math.abs(s-r)/b,w=a.reduce((l,g)=>l+g,0),x=Math.max(...e.length?e:[0])-Math.min(...e.length?e:[0]),D=x>0?Math.abs(w)/x:0,L=A(Math.round(50+N*25+D*25),50,90);return{last:t.at(-1)??null,change:a.at(-1)??0,lastDigit:t.length?Q(t.at(-1)):"—",digits:d,digitCounts:o,digitCount:d.length,even:u,odd:d.length-u,under:h,over:p,barrierHits:$,ups:s,downs:r,positive:s,negative:r,momentum:c,volatility:Math.sqrt(m),direction:S,directionStrength:L,streak:y.count,streakDirection:y.kind,digitStreak:C.count,digitStreakKind:C.kind,tickCount:t.length}}function j(t=V(),e=se()){const _a=jAll(t,e),_o={};TD_KEYS.forEach(k=>{_o[k]=_a[k]});return _o}function jAll(t=V(),e=se()){const a=t.digitCount,i=a?t.even/a:.5,s=a>=20,r=ie(e),c=e.sampleCount,m=r===null?0:e.counts[r],d=e.matchRate(r),o=t.tickCount>=20,u=t.under+t.over,h=u?t.under/u:.5,p=u>=20,$=!e.ready||r===null?"INSUFFICIENT SAMPLE":d>=.1?`MATCHES ${r}`:`DIFFERS ${r}`,y=e.ready&&d!==null?A(Math.round(50+Math.abs(d-.1)*180),50,85):50,C=s?t.even===t.odd?"BALANCED":t.even>t.odd?"EVEN":"ODD":"INSUFFICIENT SAMPLE",S=s?A(Math.round(50+Math.abs(i-.5)*100),50,80):50,b=p?t.under===t.over?"BALANCED":t.under>t.over?`UNDER ${n.barrier}`:`OVER ${n.barrier}`:"INSUFFICIENT SAMPLE",N=p?A(Math.round(50+Math.abs(h-.5)*100),50,80):50,w=o?t.streak>=3&&t.streakDirection!=="FLAT"?`ONLY ${t.streakDirection==="UP"?"UPS":"DOWNS"}`:"WATCH":"INSUFFICIENT SAMPLE",x=w==="WATCH"||w==="INSUFFICIENT SAMPLE"?50:A(Math.round(50+Math.min(t.streak,7)*5+Math.abs(t.momentum)*.5),50,88),D=o?t.direction:"INSUFFICIENT SAMPLE",L=o?t.directionStrength:50;return{highLow:tdHL(),endsInOut:tdIO(),accumulator:tdAC(),reset:{name:M.reset,prediction:D==="RISE"?"RESET CALL":D==="FALL"?"RESET PUT":D,strength:L,detail:o?`Same short-term direction read as Rise/Fall (${t.ups} rises, ${t.downs} falls). Reset contracts re-center their barrier part-way, so a steady drift helps.`:"At least 20 real ticks are needed for this read.",tone:D==="RISE"?"green":D==="FALL"?"red":"violet"},matchesDiffers:{name:M.matchesDiffers,prediction:$,strength:y,rate:d??0,detail:e.ready&&r!==null?`${n.digitTarget==="auto"?"The most frequent digit":`Digit ${r}`} matched ${m} of ${c} tick endings in the last ${e.windowSeconds}s (${(d*100).toFixed(1)}% observed).`:`Collecting a fuller ${e.windowSeconds}-second sample (${c} tick endings so far).`,tone:$.startsWith("MATCHES")?"violet":"amber"},evenOdd:{name:M.evenOdd,prediction:C,strength:S,detail:s?`${t.even} even and ${t.odd} odd endings in the latest ${a} real ticks.`:"At least 20 real digit observations are needed for this read.",tone:C==="EVEN"?"green":"violet"},overUnder:{name:M.overUnder,prediction:b,strength:N,detail:`${t.under} digits below and ${t.over} above barrier ${n.barrier}; it matched ${t.barrierHits} times.`,tone:"amber"},riseFall:{name:M.riseFall,prediction:D,strength:L,detail:o?`${t.ups} rises and ${t.downs} falls in the recent movement window; momentum ${t.momentum>=0?"+":""}${t.momentum.toFixed(2)} bps.`:"At least 20 real ticks are needed for this read.",tone:D==="RISE"?"green":D==="FALL"?"red":"violet"},continuation:{name:M.continuation,prediction:w,strength:x,detail:o?t.streak>=3?`${t.streak} consecutive ${t.streakDirection.toLowerCase()} price moves in the latest sequence.`:"No qualifying run of three consecutive rises or falls is present.":"At least 20 real ticks are needed for this read.",tone:w==="ONLY UPS"?"green":w==="ONLY DOWNS"?"red":"violet"}}}function Z(t){return n.scanType!=="auto"?t[n.scanType]:Object.values(t).sort((e,a)=>a.strength-e.strength)[0]}function ge(t){const e=(t.length?t:[0]).slice(-n.range),a=Math.min(...e),i=Math.max(...e),s=Math.max((i-a)*.15,1e-5),r=820,c=230,m=(d,o)=>{const u=o/Math.max(e.length-1,1)*r,h=c-(d-(a-s))/(i+s-(a-s))*c;return`${u.toFixed(1)},${h.toFixed(1)}`};return{points:e.map(m).join(" "),min:a-s,max:i+s,visible:e}}function he(t){const e=t.slice(-n.range);if(e.length<2)return"";const a=e.slice(1).map((o,u)=>(o-e[u])/(e[u]||1)*1e4),i=Math.min(...a),s=Math.max(...a),r=Math.max(s-i,.01),c=i-r*.12,m=230,d=a.map((o,u)=>{const h=u/Math.max(a.length-1,1)*820,p=m-(o-c)/(r*1.24)*m;return`${h.toFixed(1)},${p.toFixed(1)}`});return`M${d[0]} ${d.slice(1).map(o=>`L${o}`).join(" ")}`}function K(t,e="neutral"){return`<span class="badge ${e}"><i></i>${t}</span>`}let tdP=!1,tdPend=!1,tdPT=0,tdF=!1;
const TD_KEYS=["matchesDiffers","evenOdd","overUnder","riseFall","continuation"],TD_EMB=window.parent!==window,TD_MATCH_MIN=22,TD_EO_MIN=60,TD_OU=true,TD_HL_MIN=.26,TD_RESET_MIN=60,TD_IO_MIN=60,TD_AC_MIN=60;
function tdRelease(){tdP=!1;clearTimeout(tdPT);setTimeout(()=>{if(tdPend&&!tdP&&!tdF){tdPend=!1;f()}},140)}
function tdHL(){
  const t=n.ticks.slice(-300),W=[0,0,0,0,0],L=[0,0,0,0,0];let c=0;
  for(let i=0;i+5<=t.length;i++){
    const w=t.slice(i,i+5),mx=Math.max(...w),mn=Math.min(...w);
    if(mx===mn)continue;c++;
    const hi=w.indexOf(mx),lo=w.indexOf(mn);
    if(w.lastIndexOf(mx)===hi)W[hi]++;
    if(w.lastIndexOf(mn)===lo)L[lo]++
  }
  if(c<40)return{name:M.highLow,prediction:"INSUFFICIENT SAMPLE",strength:50,rate:0,pos:null,contract:null,windows:c,detail:`Collecting ticks: ${c} of 40 five-tick windows so far.`,tone:"violet"};
  let best={r:0,k:"TICKHIGH",p:1};
  for(let p=0;p<5;p++){if(W[p]/c>best.r)best={r:W[p]/c,k:"TICKHIGH",p:p+1};if(L[p]/c>best.r)best={r:L[p]/c,k:"TICKLOW",p:p+1}}
  const pct=Math.round(best.r*1e3)/10,nm=best.k==="TICKHIGH"?"High":"Low";
  return{name:M.highLow,prediction:`${nm.toUpperCase()} TICK ${best.p}`,strength:A(Math.round(50+(best.r-.2)*250),50,85),rate:best.r,pos:best.p,contract:best.k,windows:c,detail:`In the last ${c} five-tick windows the ${nm.toLowerCase()}est tick landed on tick ${best.p} ${pct}% of the time. Pure chance is 20%.`,tone:"amber"}
}
function tdCfg(){let c={};try{c=JSON.parse(localStorage.getItem("tickdesk.bot"))||{}}catch(e){}
  const n0=(v,d)=>v===undefined||v===null||v===""||!isFinite(+v)?d:+v;
  const pk=(v,lo,hi)=>v===undefined||v===null||v===""||!isFinite(+v)||+v<lo||+v>hi?null:Math.round(+v);
  return{stake:n0(c.stake,1)>0?n0(c.stake,1):1,mult:n0(c.mult,1)>=1?n0(c.mult,1):1,tp:Math.max(0,n0(c.tp,10)),sl:Math.max(0,n0(c.sl,10)),pickO:pk(c.pickO,0,8),pickU:pk(c.pickU,1,9)}}
function tdCfgSave(k,v){let c={};try{c=JSON.parse(localStorage.getItem("tickdesk.bot"))||{}}catch(e){}c[k]=v;try{localStorage.setItem("tickdesk.bot",JSON.stringify(c))}catch(e){}}
function tdCfgNote(c){return`A win returns the stake to ${c.stake}. A loss multiplies it by ${c.mult}`+(c.tp>0?`. Stops at +${c.tp}`:"")+(c.sl>0?` or -${c.sl}`:"")+"."}
function tdRow(key,lo,hi,c){return`<div class="td-bar" data-row="${key}"><span>${key==="pickO"?"Over barrier":"Under barrier"}</span><div class="td-chips"><button type="button" data-pick="${key}" data-p="" aria-pressed="${c[key]===null}">Scan</button>`+Array.from({length:hi-lo+1},(_,i)=>lo+i).map(d=>`<button type="button" data-pick="${key}" data-p="${d}" aria-pressed="${c[key]===d}">${d}</button>`).join("")+`</div></div>`}
function tdPanel(){const c=tdCfg();
  return`<section class="td-cfg panel-surface" aria-label="Bot settings"><div class="td-cfg-grid">`+[["stake","Stake",".01",.35],["mult","Martingale",".1",1],["tp","Take profit",".01",0],["sl","Stop loss",".01",0]].map(([k,l,st,mn])=>`<label>${l}<input data-cfg="${k}" type="number" inputmode="decimal" min="${mn}" step="${st}" value="${c[k]}"></label>`).join("")+`</div>${TD_OU?tdRow("pickO",0,8,c)+tdRow("pickU",1,9,c)+`<p class="td-cfg-note">Pick a lower Over or a higher Under barrier and Trade now loads that safer barrier, even when the signal shows another digit.</p>`:""}<p class="td-cfg-note">${tdCfgNote(c)}</p><p class="td-cfg-note">Set once. Every Trade now below loads the bot with these numbers. Use 0 to turn take profit or stop loss off.</p></section>`}
function tdSearch(c,b){
  const st=V(),d=st.digits||[],cnt=st.digitCounts||[],cn=x=>cnt[x]||0,D=[0,1,2,3,4,5,6,7,8,9];
  const top=a=>a.length?[a.slice().sort((x,y)=>cn(y)-cn(x)||x-y)[0]]:[];
  if(c==="DIGITEVEN")return top(D.filter(x=>x%2===0));
  if(c==="DIGITODD")return top(D.filter(x=>x%2===1));
  if(c==="DIGITOVER")return top(D.filter(x=>x<=b));
  if(c==="DIGITUNDER")return top(D.filter(x=>x>=b));
  if(c==="DIGITMATCH"){const l=Array(10).fill(0);for(let i=1;i<d.length;i++)if(d[i]===b&&d[i-1]!==b)l[d[i-1]]++;let best=-1;for(let x=0;x<10;x++){if(x===b)continue;if(best<0||l[x]>l[best])best=x}return[best<0?(b+1)%10:best]}
  return[]}
const TD_ROBOT={matchesDiffers:["Match-bot","#2B4C7E","#1B2F52"],evenOdd:["Pair-bot","#1F6B55","#12392F"],overUnder:["Barrier-bot","#7A5A14","#3E2E0A"],riseFall:["Trend-bot","#1D6477","#0F3440"],continuation:["Streak-bot","#7A2E45","#3E1724"],highLow:["Peak-bot","#8A4A16","#442508"],reset:["Reset-bot","#1E5E7A","#0E2F3E"],endsInOut:["Range-bot","#40407E","#202046"],accumulator:["Calm-bot","#2F6B3A","#173620"]};
function tdRobot(mood){const eye=mood==="go"?"#37C98B":mood==="watch"?"#F2B544":"#7C8A99";
  return`<svg class="td-robot ${mood}" viewBox="0 0 120 96" aria-hidden="true" focusable="false"><line x1="60" y1="9" x2="60" y2="22" stroke="#8FA3B5" stroke-width="3" stroke-linecap="round"/><circle class="td-ant" cx="60" cy="7" r="5" fill="${eye}"/><rect x="13" y="40" width="9" height="20" rx="4" fill="#3A4C5E"/><rect x="98" y="40" width="9" height="20" rx="4" fill="#3A4C5E"/><rect x="24" y="22" width="72" height="56" rx="16" fill="#C9D6E2" stroke="#8FA3B5" stroke-width="2"/><rect x="32" y="34" width="56" height="26" rx="10" fill="#0E1620"/><g class="td-eyes"><circle cx="46" cy="47" r="6.5" fill="${eye}"/><circle cx="74" cy="47" r="6.5" fill="${eye}"/><circle cx="48" cy="45" r="2" fill="#fff" opacity=".85"/><circle cx="76" cy="45" r="2" fill="#fff" opacity=".85"/></g><path d="M44 69h32" stroke="#6C7F92" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4"/><rect x="40" y="80" width="40" height="12" rx="5" fill="#3A4C5E"/></svg>`}
const tdSince={};
function tdIv(){let iv=n.times.length>1?(n.times.at(-1)-n.times[0])/(n.times.length-1):1;if(iv>1e6)iv/=1e3;return iv>0?Math.max(1,Math.round(iv)):1}
function tdWin(key){const iv=tdIv();return key==="matchesDiffers"?Math.max(1,n.scanWindowSeconds):key==="evenOdd"||key==="overUnder"?100*iv:key==="highLow"?300*iv:25*iv}
function tdClock(sec){return sec<60?sec+"s":Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")}
function tdRem(start,w){return w-(Math.floor((Date.now()-start)/1000)%w)}
function tdTick(){document.querySelectorAll(".td-exp[data-s]").forEach(e=>{const r=tdRem(+e.dataset.s,+e.dataset.w);e.textContent="⏱ "+tdClock(r);e.classList.toggle("warn",r<=5)})}
function tdDigits(){const a=se(),d=ie(a);if(d===null||!a.ready)return"";const cnt=a.counts,tot=a.sampleCount||1;
  const order=[0,1,2,3,4,5,6,7,8,9].filter(x=>x!==d).sort((x,y)=>(cnt[y]||0)-(cnt[x]||0)||x-y).slice(0,2);
  return`<div class="td-dch">`+[d].concat(order).map((x,i)=>`<span class="td-dc${i===0?" t":""}">${x}:${Math.round((cnt[x]||0)/tot*100)}%</span>`).join("")+`</div>`}
function tdBanner(key,sig){const R=TD_ROBOT[key];if(!R)return"";let t=null;try{t=tdInfo(key,sig)}catch(e){}
  const mood=t&&t.ok?"go":sig&&sig.strength>=55?"watch":"idle",txt=mood==="go"?"READY":mood==="watch"?"WATCHING":"SCANNING";
  if(mood==="go"){if(!tdSince[key])tdSince[key]=Date.now()}else delete tdSince[key];
  const w=Math.round(tdWin(key)),exp=mood==="go"?`<span class="td-exp" title="Seconds until this signal is re-checked" data-s="${tdSince[key]}" data-w="${w}">⏱ ${tdClock(tdRem(tdSince[key],w))}</span>`:"";
  return`<div class="td-banner ${mood}" data-trade="${key}" role="button" tabindex="0" aria-label="${R[0]}: ${mood==="go"?"Trade now":"not ready yet"}" style="--c1:${R[1]};--c2:${R[2]}">${tdRobot(mood)}<div class="td-bot-txt"><strong>${R[0]}</strong><span class="td-chips2"><span class="td-chip">${mood==="go"?"TRADE NOW ›":txt}</span>${exp}</span>${key==="matchesDiffers"?tdDigits():""}</div></div>`}
function tdLab(title,line){const ks=TD_KEYS.filter(k=>TD_ROBOT[k]);
  return`<section class="td-lab"><div class="td-lab-bots">${ks.map(k=>{let m="idle";try{const sg=j()[k],t=tdInfo(k,sg);m=t&&t.ok?"go":sg&&sg.strength>=55?"watch":"idle"}catch(e){}return`<div class="td-mini ${m}" data-trade="${k}" role="button" tabindex="0" title="${TD_ROBOT[k][0]}">${tdRobot(m)}<small>${TD_ROBOT[k][0]}</small></div>`}).join("")}</div><div class="td-lab-txt"><h2>${title}</h2><p>${line}</p></div></section>`}
function tdSd(a){if(a.length<3)return 0;const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)*(y-m),0)/a.length)}
function tdMoves(){const t=n.ticks.slice(-200),d=[];for(let i=1;i<t.length;i++)d.push(t[i]-t[i-1]);return d}
function tdIO(){
  const d=tdMoves();
  if(d.length<60)return{name:M.endsInOut,prediction:"INSUFFICIENT SAMPLE",strength:50,contract:null,detail:`Collecting ticks: ${d.length} of 60 so far.`,tone:"violet",ratio:1,offset:0};
  const sl=tdSd(d),ss=tdSd(d.slice(-25)),ratio=sl?ss/sl:1;
  let iv=n.times.length>1?(n.times.at(-1)-n.times[0])/(n.times.length-1):1;if(iv>1e6)iv/=1e3;if(!(iv>0))iv=1;
  const N=Math.max(1,120/iv),off=Math.max(Math.pow(10,-n.precision),+(sl*Math.sqrt(N)).toFixed(n.precision));
  let pred="WATCH",contract=null;
  if(ratio>=1.25){pred="ENDS OUTSIDE";contract="EXPIRYMISS"}else if(ratio<=.8){pred="ENDS BETWEEN";contract="EXPIRYRANGE"}
  return{name:M.endsInOut,prediction:pred,strength:contract?A(Math.round(50+Math.abs(ratio-1)*60),50,85):50,contract,ratio,offset:off,detail:contract?`Last 25 ticks are moving ${ratio>1?"more":"less"} than usual (${ratio.toFixed(2)}x the longer-run swing). Suggested barriers ±${off} for 2 minutes.`:`Recent swings are ${ratio.toFixed(2)}x the longer-run swing, no clear shift yet.`,tone:contract==="EXPIRYMISS"?"red":contract?"green":"violet"}
}
function tdAC(){
  const d=tdMoves();
  if(d.length<60)return{name:M.accumulator,prediction:"INSUFFICIENT SAMPLE",strength:50,calm:!1,detail:`Collecting ticks: ${d.length} of 60 so far.`,tone:"violet",ratio:1,spike:0};
  const sl=tdSd(d),r20=d.slice(-20),ss=tdSd(r20),ratio=sl?ss/sl:1,spike=sl?Math.max(...r20.map(Math.abs))/sl:0,calm=ratio<=.9&&spike<=2.2;
  return{name:M.accumulator,prediction:calm?"CALM · GROW":"WATCH",strength:calm?A(Math.round(50+(1-ratio)*100),50,85):50,calm,ratio,spike,detail:calm?`Last 20 ticks are quieter than normal (${ratio.toFixed(2)}x) with no big spike. Calm stretches give a growing stake more room.`:`Market is not calm enough: swings ${ratio.toFixed(2)}x normal, biggest recent move ${spike.toFixed(1)}x normal.`,tone:calm?"green":"violet"}
}
function tdInfo(key,sig){
  const a=se(),d=ie(a);let contract=null,barrier=null,label="",ok=!1,note="",extra=null;
  if(key==="matchesDiffers"){
    if(!a.ready||d===null)note="Warming up…";
    else{const mr=Math.round(a.matchRate(d)*1e3)/10;contract="DIGITMATCH";barrier=d;label=`Match ${d}`;if(mr>=TD_MATCH_MIN)ok=!0;else note=`Digit ${d} appears ${mr}% of ticks, needs ${TD_MATCH_MIN}%+`}
  }else if(key==="evenOdd"){
    if(sig.prediction==="EVEN"||sig.prediction==="ODD"){contract=sig.prediction==="EVEN"?"DIGITEVEN":"DIGITODD";label=sig.prediction==="EVEN"?"Even":"Odd";if(sig.strength>=TD_EO_MIN)ok=!0;else note=`Needs ${TD_EO_MIN}%+ strength (now ${sig.strength}%)`}
    else{label="Even/Odd";note="No clear read yet"}
  }else if(key==="overUnder"){
    if(sig.prediction.startsWith("UNDER")&&n.barrier>=1){contract="DIGITUNDER";barrier=n.barrier;label=`Under ${n.barrier}`;ok=!0}
    else if(sig.prediction.startsWith("OVER")&&n.barrier<=8){contract="DIGITOVER";barrier=n.barrier;label=`Over ${n.barrier}`;ok=!0}
    else{label="Over/Under";note="No clear read yet"}
    if(contract){const pk=tdCfg()[contract==="DIGITUNDER"?"pickU":"pickO"];if(pk!==null){barrier=pk;label=`${contract==="DIGITUNDER"?"Under":"Over"} ${pk}`}}
  }else if(key==="riseFall"){
    if(sig.prediction==="RISE"){contract="CALL";label="Rise";ok=!0}
    else if(sig.prediction==="FALL"){contract="PUT";label="Fall";ok=!0}
    else{label="Rise/Fall";note="No clear read yet"}
  }else if(key==="continuation"){
    if(sig.prediction==="ONLY UPS"){contract="RUNHIGH";label="Only Ups";ok=!0}
    else if(sig.prediction==="ONLY DOWNS"){contract="RUNLOW";label="Only Downs";ok=!0}
    else{label="Only Ups/Downs";note="Waiting for 3 moves in a row"}
  }else if(key==="highLow"){
    if(sig.contract){contract=sig.contract;barrier=sig.pos;label=`${contract==="TICKHIGH"?"High":"Low"} Tick ${sig.pos}`;if(sig.rate>=TD_HL_MIN)ok=!0;else note=`Best spot hits ${Math.round(sig.rate*1e3)/10}%, needs ${Math.round(TD_HL_MIN*100)}%+`}
    else{label="High/Low Tick";note="Warming up…"}
  }else if(key==="reset"){
    if(sig.prediction==="RESET CALL"||sig.prediction==="RESET PUT"){contract=sig.prediction==="RESET CALL"?"RESETCALL":"RESETPUT";label=contract==="RESETCALL"?"Reset Call":"Reset Put";if(sig.strength>=TD_RESET_MIN)ok=!0;else note=`Needs ${TD_RESET_MIN}%+ strength (now ${sig.strength}%)`}
    else{label="Reset Call/Put";note="No clear direction yet"}
  }else if(key==="endsInOut"){
    if(sig.contract){contract=sig.contract;label=contract==="EXPIRYMISS"?"Ends Outside":"Ends Between";extra={minutes:2,offset:sig.offset};if(sig.strength>=TD_IO_MIN)ok=!0;else note=`Needs ${TD_IO_MIN}%+ strength (now ${sig.strength}%)`}
    else{label="Ends In/Out";note=sig.prediction==="WATCH"?"No clear change in swings yet":"Warming up…"}
  }else if(key==="accumulator"){
    label="Accumulator";if(sig.calm&&sig.strength>=TD_AC_MIN){contract="ACCU";ok=!0;extra={growth_rate:.01,tick_count:5}}else note=sig.prediction==="INSUFFICIENT SAMPLE"?"Warming up…":"Wait for a calmer market"
  }else return null;
  return{ok,contract,barrier,label,note,key,extra}
}
function tdBtn(key,sig){
  if(!TD_EMB)return"";const t=tdInfo(key,sig);if(!t)return"";
  return`<div class="trade-wrap"><button type="button" class="trade-now" data-trade="${key}" ${t.ok?"":"disabled"}>Trade now · ${t.label}</button>${t.ok?"":`<small>${t.note}</small>`}</div>`
}
function tdScanCta(pass,a){
  const key=Object.keys(M).find(x=>M[x]===a.name);
  if(!TD_EMB)return pass?`<a class="scanner-cta" href="https://app.deriv.com/bot" target="_blank" rel="noopener noreferrer">Open on Deriv bot <span>↗</span></a>`:`<button class="scanner-cta disabled" type="button" disabled>Wait for stronger signal</button>`;
  if(!pass)return`<button class="scanner-cta disabled" type="button" disabled>Wait for stronger signal</button>`;
  const t=tdInfo(key,a);
  if(!t||!t.ok)return`<button class="scanner-cta disabled" type="button" disabled>${t&&t.note||"No trade signal right now"}</button>`;
  return`<button class="scanner-cta" type="button" data-trade="${key}">Open on Deriv bot · ${t.label} <span>↗</span></button>`
}
function tdTrade(key){
  if(!TD_EMB){q("Trade now opens the Deriv bot builder, so it works inside the full site.");return}
  const sig=j()[key],t=tdInfo(key,sig);
  if(!t||!t.ok){q(t&&t.note||"No trade signal right now.");return}
  const m=k[n.market];
  window.parent.postMessage({type:"tickdesk:signal",signal:{symbol:n.market,name:m?m.label:n.market,contract:t.contract,kind:key,barrier:t.barrier,trigger:tdSearch(t.contract,t.barrier),runs:10,stake:tdCfg().stake,mult:tdCfg().mult,tp:tdCfg().tp,sl:tdCfg().sl,ticks:t.contract.startsWith("TICK")||t.contract.startsWith("RESET")?5:t.contract.startsWith("RUN")?2:1,...(t.extra||{}),rate:sig.strength,base:0,at:Date.now()}},window.location.origin);
  q("Opening Deriv bot builder…")
}
function tdSel(){
  const sels=document.querySelectorAll("#marketSelect,#scanDigitTarget,#scanType,#threshold");
  sels.forEach(s=>{
    if(s.id!=="marketSelect"){
      s.addEventListener("pointerdown",te);
      s.addEventListener("keydown",e=>{["ArrowDown","ArrowUp","Enter"," "].includes(e.key)&&te(),e.key==="Escape"&&G()});
      s.addEventListener("cancel",G);
    }
    s.addEventListener("blur",G);
  });
  document.querySelectorAll("[data-trade]").forEach(b=>b.addEventListener("click",()=>tdTrade(b.dataset.trade)));
  document.querySelectorAll('.td-banner[data-trade],.td-mini[data-trade]').forEach(b=>b.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();tdTrade(b.dataset.trade)}}));
  if(!window.__tdExp){window.__tdExp=setInterval(tdTick,1000)}
  document.querySelectorAll("[data-pick]").forEach(b=>b.addEventListener("click",()=>{
    const k=b.dataset.pick;tdCfgSave(k,b.dataset.p===""?null:+b.dataset.p);
    document.querySelectorAll(`[data-pick="${k}"]`).forEach(x=>x.setAttribute("aria-pressed",x===b?"true":"false"));
    tdPend=!0;tdRelease()}));
  document.querySelectorAll("[data-cfg]").forEach(inp=>{
    inp.addEventListener("focus",()=>{tdF=!0});
    inp.addEventListener("blur",()=>{tdF=!1;tdRelease()});
    inp.addEventListener("input",()=>{
      const k=inp.dataset.cfg;let v=parseFloat(inp.value);if(!isFinite(v))return;
      if(k==="stake")v=Math.max(.35,v);else if(k==="mult")v=Math.max(1,v);else v=Math.max(0,v);
      tdCfgSave(k,v);const el=document.querySelector(".td-cfg-note");if(el)el.textContent=tdCfgNote(tdCfg())});
  });
  if(!window.__tdPtr){window.__tdPtr=1;
    document.addEventListener("pointerdown",e=>{if(e.target.closest&&e.target.closest("select"))return;tdP=!0;clearTimeout(tdPT);tdPT=setTimeout(tdRelease,2500)},!0);
    ["pointerup","pointercancel"].forEach(ev=>document.addEventListener(ev,tdRelease,!0));
  }
}
function B({icon:t,name:e,tag:a,signal:i,metrics:s,action:r}){return`
    <article class="signal-card ${i.tone}">${tdBanner(r,i)}
      <div class="signal-head">
        <div class="signal-title"><span class="signal-icon">${t}</span><div><strong>${e}</strong><span>${a}</span></div></div>
        ${K(n.connection==="live"?"Live feed":"Awaiting feed",n.connection==="live"?"live":"muted")}
      </div>
      <div class="signal-body">
        <div class="signal-main"><span class="eyebrow">Current read</span><div class="prediction ${i.tone}">${i.prediction}</div><p>${i.detail}</p></div>
        <div class="confidence-ring" style="--score:${i.strength}"><span>${i.strength}<small>%</small></span><em>strength</em></div>
      </div>
      <div class="metrics">${s.map(([c,m])=>`<div><span>${c}</span><strong>${m}</strong></div>`).join("")}</div>
      ${tdBtn(r,i)}<button class="card-action" data-action="scan-${r}">Use in scanner <span>→</span></button>
    </article>`}function ve(t,e){const a=e===null?null:t.matchRate(e),i=e===null?null:t.differRate(e),s=o=>o===null?"—":`${(o*100).toFixed(1)}%`,r=Math.min(t.windowSeconds,Math.floor(t.coverageSeconds)),c=t.continuityReady?t.fresh?t.sampleCount<t.minSamples?`need at least ${t.minSamples} tick endings`:`need at least ${Math.ceil(t.windowSeconds*.8)}s of window span`:"waiting for a fresh market tick":`largest tick gap ${Math.floor(t.maxGapSeconds)}s`,m=t.ready?`Ready · ${t.sampleCount} real tick endings across ${r}/${t.windowSeconds}s`:`Warming up · ${t.sampleCount} tick endings, ${r}/${t.windowSeconds}s span · ${c}`,d=n.digitTarget==="auto"?`Leading observed digit ${e??"—"}`:`Manually selected digit ${e}`;return`
    <section class="digit-scan-panel panel-surface" aria-label="Rolling Matches and Differs digit scanner">
      <div class="digit-scan-header">
        <div>
          <div class="section-kicker"><span></span> MATCHES / DIFFERS · ALL LAST DIGITS</div>
          <h2>Scan every digit, not just one.</h2>
          <p>Live digit frequencies for the selected synthetic market and rolling time window.</p>
        </div>
        <div class="digit-window-controls" role="group" aria-label="Digit scan duration">
          ${ue.map(o=>`<button type="button" data-scan-window="${o}" class="${o===n.scanWindowSeconds?"selected":""}" aria-pressed="${o===n.scanWindowSeconds}">${o}s</button>`).join("")}
        </div>
      </div>

      <div class="digit-scan-summary ${t.ready?"ready":"warming"}">
        <div class="digit-summary-lead"><span>WINDOW STATUS</span><strong>${m}</strong></div>
        <label class="digit-mode">Digit to compare<select id="scanDigitTarget">
          <option value="auto" ${n.digitTarget==="auto"?"selected":""}>Auto · most frequent observed digit</option>
          ${Array.from({length:10},(o,u)=>`<option value="${u}" ${String(u)===String(n.digitTarget)?"selected":""}>Digit ${u}</option>`).join("")}
        </select></label>
        <div class="digit-summary-rates"><span>${d}</span><strong>${e===null?"No digit yet":`MATCHES ${e} · ${s(a)}`}</strong><small>${e===null?"Waiting for real tick history.":`DIFFERS ${e} · ${s(i)} observed`}</small></div>
      </div>

      <div class="digit-frequency-table" role="table" aria-label="Observed match and differ rates for digits zero through nine">
        <div class="digit-table-head" role="row"><span>Digit</span><span>Ticks</span><span>Matches · observed</span><span>Differs · observed</span></div>
        ${Array.from({length:10},(o,u)=>{const h=t.matchRate(u),p=t.differRate(u),$=u===t.bestDigit&&t.sampleCount>0,y=u===e;return`<button type="button" class="digit-frequency-row ${$?"leading":""} ${y?"selected":""}" data-scan-digit="${u}" aria-pressed="${y}">
            <span class="digit-cell"><b>${u}</b>${$?"<small>LEAD</small>":y&&n.digitTarget!=="auto"?"<small>PINNED</small>":""}</span>
            <span class="digit-count">${t.counts[u]}</span>
            <span class="digit-rate"><span class="digit-rate-line"><i style="width:${h===null?0:(h*100).toFixed(1)}%"></i></span><b>${s(h)}</b></span>
            <span class="digit-differ-rate">${s(p)}</span>
          </button>`}).join("")}
      </div>
      <p class="digit-scan-footnote">Percentages are measured from actual tick endings inside the selected window; they are historical frequencies, not a guarantee or calibrated probability of the next tick. Rates remain provisional while the window is warming up.</p>
    </section>`}function f(){if(R||U)return;if(tdP||tdF){tdPend=!0;return}E!==null&&(window.clearTimeout(E),E=null);const t=k[n.market]||Object.values(k)[0],e=V(),a=se(),i=ie(a),s=j(e,a),r=e.under+e.over,c=e.change>0?"up":e.change<0?"down":"flat",m=c==="up"?"↗":c==="down"?"↘":"→",d=`${e.change>0?"+":""}${H(e.change)}`,{points:o,min:u,max:h,visible:p}=ge(n.ticks),$=he(n.ticks),y=!e.tickCount||p[0]===p.at(-1)?115:p[0]>p.at(-1)?55:175,C=y===115?115:230-y,S={connecting:["Connecting","muted"],syncing:["Loading real history","muted"],subscribing:["Starting live stream","muted"],live:["Real feed · live","live"],reconnecting:["Reconnecting","muted"],disconnected:["Disconnected","muted"],paused:["Feed paused","muted"],error:["Feed error","muted"]}[n.connection]||["Connecting","muted"],b=e.tickCount>0,N=b?`${e.tickCount} real ticks loaded`:"Waiting for Deriv tick history",x=[...Object.values(k).reduce((l,g)=>{const v=g.categoryLabel||"Synthetic Indices";return l.has(v)||l.set(v,[]),l.get(v).push(g),l},new Map).entries()].map(([l,g])=>`<optgroup label="${O(l)}">${g.map(v=>`<option value="${O(v.code)}" ${v.code===n.market?"selected":""}>${O(v.label)} · ${O(v.code)}</option>`).join("")}</optgroup>`).join(""),D=n.marketCatalogLoading?"Refreshing active markets…":n.marketCatalogError?O(n.marketCatalogError):`${Object.keys(k).length} active synthetic markets`,L=i===null||a.matchRate(i)===null?"—":`${(a.matchRate(i)*100).toFixed(1)}%`;document.querySelector("#app").innerHTML=`
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#top" aria-label="DerivScope home"><span class="brand-mark"><b></b><b></b><b></b></span><span>deriv<span>scope</span></span></a>
        <div class="workspace-pill">ANALYSIS DESK <span>⌄</span></div>
        <nav aria-label="Dashboard navigation">
          <button class="nav-item active" data-action="dashboard"><span>◫</span> Overview</button>
          <button class="nav-item" data-action="signal-history"><span>◷</span> Signal history</button>
          <button class="nav-item" data-action="methodology"><span>◇</span> Scanner rules</button>
        </nav>
        <div class="sidebar-bottom">
          <div class="demo-note live-note"><span class="demo-dot"></span><div><strong>Deriv public feed</strong><small>No broker login required</small></div></div>
          <button class="help-link" data-action="methodology"><span>?</span> Strength is not win probability</button>
        </div>
      </aside>

      <main id="top" class="main-content">
        <header class="topbar">
          <div class="crumbs"><span>ANALYSIS</span><b>/</b><strong>MARKET PULSE</strong></div>
          <div class="topbar-actions">
            <div class="status-line">${K(S[0],S[1])}</div>
            <button class="icon-button" data-action="toggle-live" title="${n.isLive?"Pause":"Resume"} public data stream">${n.isLive?"Ⅱ":"▶"}</button>
            <button class="avatar" title="Analysis only">DS</button>
          </div>
        </header>

        <section class="hero">
          <div>
            <div class="section-kicker"><span></span> DERIV PUBLIC MARKET DATA · ANALYSIS ONLY</div>
            <h1>Market pulse <em>at a glance.</em></h1>
            <p>Live Deriv tick data with transparent digit and directional signals. Scanner prompts are manual only; no orders are sent from this dashboard.</p>
          </div>
          <div class="market-picker">
            <label for="marketSelect">Selected market</label>
            <div class="select-wrap"><select id="marketSelect">${x}</select><span>⌄</span></div>
            <div class="market-catalog-meta"><small>${D}</small><button type="button" data-action="refresh-markets" ${n.marketCatalogLoading?"disabled":""}>Refresh list</button></div>
          </div>
        </section>

        ${tdLab('Robot desk','Nine digit robots watch the live ticks. A glowing green robot means its setup passes your trigger.')}<section class="snapshot-grid" aria-label="Live market snapshot">
          <article class="quote-panel">
            <div class="panel-label">Live Deriv quote ${K("REAL DATA","real")}</div>
            <div class="quote-line"><strong>${b?H(e.last):"—"}</strong><span class="delta ${b?c:""}">${b?`${m} ${d}`:"Waiting for first tick"}</span></div>
            <div class="quote-meta"><span>${t.code}</span><i></i><span>last digit <b>${e.lastDigit}</b></span><i></i><span>${b?`tick #${e.tickCount}`:S[0]}</span></div>
          </article>
          <article class="stat-panel"><div class="stat-icon teal">〽</div><div><span>Short-term trend</span><strong class="${c}">${b?e.direction:"—"}</strong><small>${e.streak} ${e.streakDirection.toLowerCase()} moves · ${e.momentum>=0?"+":""}${e.momentum.toFixed(2)} bps</small></div></article>
          <article class="stat-panel"><div class="stat-icon amber">◌</div><div><span>Tick volatility</span><strong>${b?`σ ${e.volatility.toFixed(2)} bps`:"—"}</strong><small>${N}</small></div></article>
          <article class="stat-panel"><div class="stat-icon violet">⌁</div><div><span>Connection status</span><strong>${S[0]}</strong><small>${n.connectionError||"Unauthenticated public feed"}</small></div></article>
        </section>

        <section class="chart-section panel-surface">
          <div class="section-header">
            <div><div class="section-kicker"><span></span> DERIV TICK STREAM</div><h2>Recent price movement</h2></div>
            <div class="chart-controls">
              <div class="segmented" role="group" aria-label="Tick range">${[20,30,60].map(l=>`<button data-range="${l}" class="${n.range===l?"selected":""}">${l} ticks</button>`).join("")}</div>
              <div class="segmented overlay" role="group" aria-label="Chart overlay"><button data-overlay="trend" class="${n.overlay==="trend"?"selected":""}">Trend</button><button data-overlay="momentum" class="${n.overlay==="momentum"?"selected":""}">Momentum</button></div>
            </div>
          </div>
          <div class="chart-wrap">
            <div class="chart-axis top">${b?H(h):"—"}</div><div class="chart-axis bottom">${b?H(u):"—"}</div>
            <svg class="price-chart" viewBox="0 0 820 230" preserveAspectRatio="none" aria-label="Live Deriv tick-price chart">
              <defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4ff5ac" stop-opacity=".23"/><stop offset="100%" stop-color="#4ff5ac" stop-opacity="0"/></linearGradient></defs>
              <g class="chart-grid"><line x1="0" y1="46" x2="820" y2="46"/><line x1="0" y1="115" x2="820" y2="115"/><line x1="0" y1="184" x2="820" y2="184"/></g>
              <polyline class="chart-area" points="${b?`0,230 ${o} 820,230`:""}"/>
              <polyline class="chart-line ${c}" points="${b?o:""}"/>
              ${n.overlay==="trend"&&b?`<line class="trend-line" x1="0" y1="${y}" x2="820" y2="${C}"/>`:n.overlay==="momentum"&&b&&$?`<path class="momentum-line" d="${$}"/>`:""}
            </svg>
            <div class="chart-footer"><span>− ${n.range} ticks</span><span>${b?n.overlay==="momentum"?"normalized per-tick momentum · bps":"latest Deriv tick":"waiting for live data"}</span></div>
          </div>
        </section>

        ${Se(e,s)}

        ${ve(a,i)}

        ${tdPanel()}<section class="analysis-heading">
          <div><div class="section-kicker"><span></span> CONTRACT LENSES</div><h2>Signal board</h2></div>
          <p>Values update from recent public ticks. Strength is a market-pattern score, not a probability of profit.</p>
        </section>

        <section class="signal-grid">
          ${B({icon:"≋",name:"Matches / Differs",tag:n.digitTarget==="auto"?`Auto digit ${i??"—"} · ${n.scanWindowSeconds}s`:`Digit ${i} · ${n.scanWindowSeconds}s`,signal:s.matchesDiffers,metrics:[["Matches observed",L],["Digit mode",n.digitTarget==="auto"?"Auto":`Pinned ${i}`],["Window ticks",a.sampleCount]],action:"matchesDiffers"})}
          ${B({icon:"½",name:"Even / Odd",tag:"Last-digit balance",signal:s.evenOdd,metrics:[["Even",`${e.digitCount?Math.round(e.even/e.digitCount*100):0}%`],["Digit run",`${e.digitStreak} ${e.digitStreakKind.toLowerCase()}`],["Last digit",e.lastDigit]],action:"evenOdd"})}
          ${B({icon:"≤",name:"Over / Under",tag:`Barrier ${n.barrier}`,signal:s.overUnder,metrics:[["Under",`${r?Math.round(e.under/r*100):0}%`],["Over",`${r?Math.round(e.over/r*100):0}%`],["Barrier",`<button class="barrier-step" data-action="barrier-down">−</button> ${n.barrier} <button class="barrier-step" data-action="barrier-up">+</button>`]],action:"overUnder"})}
          ${B({icon:"↗",name:"Rise / Fall",tag:"Short-term direction",signal:s.riseFall,metrics:[["Up moves",e.ups],["Down moves",e.downs],["Momentum",`${e.momentum>=0?"+":""}${e.momentum.toFixed(2)} bps`]],action:"riseFall"})}
          ${B({icon:"⇈",name:"Only Ups / Downs",tag:"Continuation pattern",signal:s.continuation,metrics:[["Direction",e.streakDirection],["Streak",`${e.streak} moves`],["Filter","≥ 3 moves"]],action:"continuation"})}
        </section>

        <p class="td-risk"><b>Risk note:</b> signals show past patterns, not guaranteed results. You can lose your stake, so only trade money you can afford to lose and try a demo account first.</p>

        <section class="bottom-grid">
          <article class="history-panel panel-surface">
            <div class="section-header compact"><div><div class="section-kicker"><span></span> TRACEABILITY</div><h2>Recent scanner snapshots</h2></div><button class="text-button" data-action="refresh-history">Capture now <span>↻</span></button></div>
            <div class="history-table"><div class="table-head"><span>Contract</span><span>Read</span><span>Strength</span><span>Record</span></div>${n.signalHistory.length?n.signalHistory.map(l=>`<div class="history-row"><span><b>${l.contract}</b><small>${l.market} · ${l.time}</small></span><span class="history-read ${l.tone}">${l.prediction}</span><span><div class="mini-progress"><i style="width:${l.strength}%"></i></div><small>${l.strength}%</small></span><span class="outcome">Snapshot only</span></div>`).join(""):'<div class="history-empty">No scanner snapshots yet. Use “Capture now” to save a live reading.</div>'}</div>
          </article>
          <aside class="method-card">
            <span class="method-icon">✦</span><div class="section-kicker">SCANNER RULES</div><h3>Strength is not win probability.</h3><p>The scanner compares recent digit balance and price movement against its neutral baseline. It does not know your stake, payout, or contract result.</p><button data-action="methodology">How the scanner decides <span>→</span></button>
          </aside>
        </section>

        <footer><span>Real market ticks via Deriv’s public data feed.</span><span>Analysis only · no account connection, funds, or trade execution.</span></footer>
      </main>
    </div>
    <div class="toast ${n.toast?"show":""}" role="status">${n.toast}</div>
  `,$e()}function q(t){n.toast=t,f(),window.setTimeout(()=>{n.toast="",f()},2600)}function _(){if(!n.isLive)return;const t=k[n.market];if(!t)return;clearTimeout(F);const e=++T;I==null||I.close(),I=null,n.connection="connecting",n.connectionError="",n.ticks=[],n.times=[],n.precision=t.precision,f(),I=de({symbol:t.code,onStatus:a=>{e===T&&(a==="disconnected"?(n.connection="reconnecting",f(),F=window.setTimeout(()=>{n.isLive&&e===T&&_()},4e3)):(n.connection=a,a==="live"&&ee(),f()))},onError:a=>{e===T&&(n.connection="error",n.connectionError=a,f(),clearTimeout(F),F=window.setTimeout(()=>{n.isLive&&e===T&&_()},4e3))},onHistory:({prices:a,times:i,precision:s})=>{e===T&&(a.length&&(n.ticks=a.map(Number)),i.length&&(n.times=i.map(Number)),Number.isInteger(s)&&(n.precision=A(s,0,8)),n.connectionError="",f())},onTick:({quote:a,epoch:i,precision:s})=>{e!==T||!Number.isFinite(a)||(Number.isInteger(s)&&(n.precision=A(s,0,8)),n.times.at(-1)===i?n.ticks[n.ticks.length-1]=a:(n.ticks.push(a),n.times.push(i)),n.ticks=n.ticks.slice(-5e3),n.times=n.times.slice(-5e3),n.connectionError="",ee(),f())}})}function fe(){n.isLive=!1,T+=1,clearTimeout(F),I==null||I.close(),I=null,n.connection="paused",f()}function be(){n.isLive=!0,_()}function ye(){var s;const t=V();if(n.connection!=="live"||t.tickCount<20){q("Wait for a live Deriv feed and at least 20 ticks before saving a scan.");return}const e=Z(j(t)),a=new Date,i=new Intl.DateTimeFormat("en",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(a);n.signalHistory=[{contract:e.name,prediction:e.prediction,strength:e.strength,tone:e.tone,market:((s=k[n.market])==null?void 0:s.code)||n.market,time:i},...n.signalHistory].slice(0,8),J=Date.now(),q("Live scanner snapshot saved. No order was placed.")}function ee(){var e;const t=V();if(!(n.connection!=="live"||t.tickCount<20)&&(!n.signalHistory.length||Date.now()-J>=6e4)){const a=Z(j(t)),i=new Date;n.signalHistory=[{contract:a.name,prediction:a.prediction,strength:a.strength,tone:a.tone,market:((e=k[n.market])==null?void 0:e.code)||n.market,time:new Intl.DateTimeFormat("en",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(i)},...n.signalHistory].slice(0,8),J=Date.now()}}function ke(t){const e=V(),a={dashboard:"You are viewing the Market Pulse dashboard.","signal-history":"Recent scanner snapshots are shown below the signal board.",methodology:"Scanner strength is a heuristic: it summarizes recent pattern deviation and trend agreement. It is not a win probability, payout estimate, or guarantee.","refresh-history":""};if(t==="toggle-live"){n.isLive?fe():be();return}if(t==="barrier-up"||t==="barrier-down"){n.barrier=A(n.barrier+(t==="barrier-up"?1:-1),1,9),f();return}if(t==="refresh-history"){ye();return}if(t==="refresh-markets"){re();return}if(t.startsWith("scan-")){n.scanType=t.slice(5),f();return}const i=Object.keys(M).find(s=>t===`show-${s}`);if(i){const s=j(e)[i];q(`${s.name}: ${s.prediction} · ${s.strength}% pattern strength. This is not a probability of profit.`);return}q(a[t]||"Analysis panel selected.")}function G(){R&&(R=!1,U=!0,window.clearTimeout(E),E=window.setTimeout(()=>{U=!1,E=null,f()},160))}function te(){window.clearTimeout(E),E=null,U=!1,R=!0}function $e(){const t=document.querySelector("#marketSelect");t.addEventListener("pointerdown",te),t.addEventListener("keydown",e=>{["ArrowDown","ArrowUp","Enter"," "].includes(e.key)&&te(),e.key==="Escape"&&G()}),t.addEventListener("cancel",G),t.addEventListener("change",e=>{R=!1,U=!1,window.clearTimeout(E),E=null,n.market=e.target.value,_()}),Y||(document.addEventListener("pointerdown",e=>{const a=document.querySelector("#marketSelect");R&&!(a!=null&&a.contains(e.target))&&G()},!0),Y=!0),document.querySelector("#scanType").addEventListener("change",e=>{R=!1,U=!1,window.clearTimeout(E),E=null,n.scanType=e.target.value,f()}),document.querySelector("#threshold").addEventListener("change",e=>{R=!1,U=!1,window.clearTimeout(E),E=null,n.threshold=Number(e.target.value),f()}),document.querySelector("#scanDigitTarget").addEventListener("change",e=>{R=!1,U=!1,window.clearTimeout(E),E=null,n.digitTarget=e.target.value==="auto"?"auto":Number(e.target.value),f()}),document.querySelectorAll("[data-scan-window]").forEach(e=>e.addEventListener("click",()=>{n.scanWindowSeconds=Number(e.dataset.scanWindow),f()})),document.querySelectorAll("[data-scan-digit]").forEach(e=>e.addEventListener("click",()=>{n.digitTarget=Number(e.dataset.scanDigit),f()})),document.querySelectorAll("[data-range]").forEach(e=>e.addEventListener("click",()=>{n.range=Number(e.dataset.range),f()})),document.querySelectorAll("[data-overlay]").forEach(e=>e.addEventListener("click",()=>{n.overlay=e.dataset.overlay,f()})),document.querySelectorAll("[data-action]").forEach(e=>e.addEventListener("click",()=>ke(e.dataset.action))),tdSel()}function Se(t,e){const a=Z(e),i=n.connection==="live"&&t.tickCount>=20,s=i&&a.strength>=n.threshold,r=i?s?`Strength meets your ${n.threshold}% trigger. This is a manual prompt, not an order.`:`Strength is below your ${n.threshold}% trigger. Wait for a stronger setup.`:"Wait for a live feed and enough real ticks before scanning.",c=n.scanType==="auto"?"Auto · strongest contract":`${a.name} · ${a.prediction}`;return`
    <section class="scanner-panel panel-surface" aria-label="Market strength scanner">
      <div class="scanner-copy">
        <div class="section-kicker"><span></span> STRENGTH SCANNER · REAL MARKET DATA</div>
        <h2>Scan before you decide.</h2>
        <p>Strength is a pattern score from recent Deriv ticks. It is <strong>not</strong> a win probability.</p>
      </div>
      <div class="scanner-result ${s?"ready":"wait"}">
        <div class="scanner-score"><span>${a.strength}<small>%</small></span><em>signal strength</em></div>
        <div class="scanner-decision"><span class="decision-label">${s?"SETUP PASSES":"NO QUALIFIED SETUP"}</span><strong>${s?"TRADE NOW":"WAIT"}</strong><small>${r}</small></div>
        ${tdScanCta(s,a)}
      </div>
      <div class="scanner-controls">
        <label>Contract to scan<select id="scanType"><option value="auto" ${n.scanType==="auto"?"selected":""}>Auto · strongest contract</option>${Object.entries(M).map(([m,d])=>`<option value="${m}" ${m===n.scanType?"selected":""}>${d}</option>`).join("")}</select></label>
        <label>Trade-now threshold<select id="threshold">${[55,60,65,70,75,80].map(m=>`<option value="${m}" ${n.threshold===m?"selected":""}>${m}% strength</option>`).join("")}</select></label>
        <div class="scanner-current"><span>Current scan</span><strong>${c}</strong></div>
      </div>
      <div class="scanner-footnote">Opens Deriv\u2019s bot builder with the signal bot ready. Nothing is traded until you tap Run yourself.</div>
    </section>`}async function re(){var e,a;n.marketCatalogLoading=!0,n.marketCatalogError="",f();const t=(e=k[n.market])==null?void 0:e.code;try{const i=await le(),s=Object.fromEntries(i.map(r=>[r.code,r]));if(!Object.keys(s).length)throw new Error("No active synthetic markets were returned.");k=s,k[n.market]||(n.market=k["1HZ10V"]?"1HZ10V":i[0].code),n.marketCatalogLoading=!1,n.marketCatalogError="",((a=k[n.market])==null?void 0:a.code)!==t?_():f()}catch(i){n.marketCatalogLoading=!1;const s=i instanceof Error?i.message:"Could not refresh Deriv’s active market list.";n.marketCatalogError=`Using bundled last-known ${Object.keys(k).length}-market list · ${s}`,f()}}function we(){f(),_(),re()}we();

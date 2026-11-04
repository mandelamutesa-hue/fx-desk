"use strict";
const PAIRS=["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","USD/CHF","NZD/USD"];
const M15=9e5,H1=36e5,STOP_ATR=1.5,MAX_HOLD=32,SESSION=[7,20];
const pipOf=p=>p.includes("JPY")?0.01:0.0001;
const dpOf=p=>p.includes("JPY")?3:5;
function parseCandles(j){return j.values.map(v=>({t:Date.parse(v.datetime.replace(" ","T")+"Z"),o:+v.open,h:+v.high,l:+v.low,c:+v.close})).filter(c=>isFinite(c.t)&&isFinite(c.c)).sort((a,b)=>a.t-b.t)}
/* ---------- indicators ---------- */
function ema(v,n){const o=new Array(v.length).fill(NaN),k=2/(n+1);let s=0;for(let i=0;i<v.length;i++){if(i<n-1){s+=v[i];continue}if(i===n-1){s+=v[i];o[i]=s/n;continue}o[i]=v[i]*k+o[i-1]*(1-k)}return o}
function rsi(c,n=14){const o=new Array(c.length).fill(NaN);let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);if(i<=n){g+=u;l+=w;if(i===n){g/=n;l/=n;o[i]=l===0?100:100-100/(1+g/l)}}else{g=(g*(n-1)+u)/n;l=(l*(n-1)+w)/n;o[i]=l===0?100:100-100/(1+g/l)}}return o}
function atr(C,n=14){const o=new Array(C.length).fill(NaN);let s=0;for(let i=1;i<C.length;i++){const a=C[i],p=C[i-1].c,tr=Math.max(a.h-a.l,Math.abs(a.h-p),Math.abs(a.l-p));if(i<=n){s+=tr;if(i===n){s/=n;o[i]=s}}else{s=(s*(n-1)+tr)/n;o[i]=s}}return o}

/* Builds every indicator from closed candles. H1 values only use hours already finished, so tests can't see the future. */
function analyse(C){
  const c=C.map(x=>x.c),e20=ema(c,20),e50=ema(c,50),r=rsi(c),a=atr(C);
  const hrs=[];for(const x of C){const b=Math.floor(x.t/H1)*H1;if(hrs.length&&hrs[hrs.length-1].b===b)hrs[hrs.length-1].c=x.c;else hrs.push({b,c:x.c})}
  const hc=hrs.map(h=>h.c),h20=ema(hc,20),h50=ema(hc,50);
  const ht=new Array(C.length).fill(0);let p=-1;
  for(let i=0;i<C.length;i++){const end=C[i].t+M15;while(p+1<hrs.length&&hrs[p+1].b+H1<=end)p++;if(p>=0&&!isNaN(h50[p]))ht[i]=h20[p]>h50[p]?1:-1}
  return{C,e20,e50,r,a,ht};
}
function evalAt(A,i){
  const x=A.C[i],a=A.a[i];
  if(isNaN(a)||isNaN(A.e50[i])||!A.ht[i])return{dir:0,label:"Not enough data",cls:""};
  const h=new Date(x.t+M15).getUTCHours(),inS=h>=SESSION[0]&&h<SESSION[1];
  const up=A.e20[i]>A.e50[i],dn=A.e20[i]<A.e50[i],near=Math.abs(x.c-A.e20[i])<=0.5*a,rv=A.r[i];
  const trend=A.ht[i]===1&&up?1:A.ht[i]===-1&&dn?-1:0;
  if(!trend)return{dir:0,label:"No clear trend",cls:"",inS};
  const word=trend>0?"Uptrend":"Downtrend";
  if(!inS)return{dir:0,label:word+", outside session",cls:"",inS};
  const okSide=trend>0?x.c>A.e50[i]&&rv>=40&&rv<=65:x.c<A.e50[i]&&rv>=35&&rv<=60;
  if(near&&okSide)return{dir:trend,label:trend>0?"Long setup":"Short setup",cls:trend>0?"long":"short",inS};
  return{dir:0,label:word+", waiting for pullback",cls:"",inS};
}
function backtest(A,pip,rr,spreadPips){
  const C=A.C,out=[];let i=210;
  while(i<C.length-1){
    const s=evalAt(A,i);if(!s.dir){i++;continue}
    const d=s.dir,dist=STOP_ATR*A.a[i],en=C[i+1].o,stop=en-d*dist,tgt=en+d*dist*rr;let ex=null,j=i+1;
    for(;j<C.length&&j<=i+MAX_HOLD;j++){const k=C[j];
      if(d>0?k.l<=stop:k.h>=stop){ex=stop;break}
      if(d>0?k.h>=tgt:k.l<=tgt){ex=tgt;break}}
    if(ex===null){if(j>=C.length)break;j=i+MAX_HOLD;ex=C[j].c}
    out.push((ex-en)*d/dist-spreadPips*pip/dist);i=j+1;
  }
  const n=out.length;if(!n)return{n:0};
  const avg=out.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(out.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(n-1,1)),se=sd/Math.sqrt(n);
  return{n,avg,low:avg-2*se,high:avg+2*se,win:out.filter(r=>r>0).length/n,total:out.reduce((a,b)=>a+b,0)};
}
const edgeVerdict=b=>!b||b.n<30?{t:"Too few trades",c:"warn"}:b.low>0?{t:"Edge in this sample",c:"good"}:b.high<0?{t:"Lost money in test",c:"bad"}:{t:"No proven edge",c:"warn"};

/* ---------- position size ---------- */
function pipValuePerLot(pair,px){const pip=pipOf(pair)*1e5;return pair.endsWith("/USD")?pip:pip/px}
function sizePosition({pair,px,stopPips,bal,riskPct,lev}){
  const riskUsd=bal*riskPct/100,pv=pipValuePerLot(pair,px),raw=riskUsd/(stopPips*pv),lots=Math.floor(raw*100+1e-9)/100;
  const notional=lots*1e5*(pair.endsWith("/USD")?px:1);
  return{riskUsd,pv,lots,notional,margin:notional/lev,actualRisk:lots*stopPips*pv,exposure:notional/bal};
}


if(typeof module!=="undefined")module.exports={PAIRS,M15,STOP_ATR,pipOf,dpOf,parseCandles,analyse,evalAt,backtest,edgeVerdict};

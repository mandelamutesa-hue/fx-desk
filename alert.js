// Runs on a schedule in GitHub Actions. Checks each pair's latest closed 15-minute candle
// with the same rule as the app, and sends a phone notification when a setup appears.
const {PAIRS,pipOf,dpOf,STOP_ATR,parseCandles,analyse,evalAt,backtest,edgeVerdict,betText,plainWait,plainVerdict}=require("./engine.js");
const APP=process.env.APP_URL||"https://mandelamutesa-hue.github.io/fx-desk/";
const KEY=process.env.TWELVE_DATA_KEY,TOPIC=process.env.NTFY_TOPIC,TEST=process.env.SEND_TEST==="true";
const RR=+(process.env.REWARD_MULTIPLE||2),SPREAD=+(process.env.SPREAD_PIPS||1),ONLY_EDGE=process.env.ONLY_PROVEN==="true";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function notify(title,body,priority="high"){
  const r=await fetch("https://ntfy.sh/"+encodeURIComponent(TOPIC),{method:"POST",headers:Object.assign({Title:title,Priority:priority},APP?{Click:APP}:{}),body});
  if(!r.ok)throw new Error("Notification failed: "+r.status);
}
async function checkPair(pair){
  const u="https://api.twelvedata.com/time_series?"+new URLSearchParams({symbol:pair,interval:"15min",outputsize:5000,timezone:"UTC",apikey:KEY});
  const j=await(await fetch(u)).json();
  if(j.status==="error"||!j.values)throw new Error(pair+": "+(j.message||"no data"));
  const now=Date.now(),closed=parseCandles(j).filter(c=>c.t+9e5<=now);
  const A=analyse(closed),i=closed.length-1,s=evalAt(A,i),x=closed[i],pip=pipOf(pair),dp=dpOf(pair);
  const b=backtest(A,pip,RR,SPREAD),v=edgeVerdict(b),age=now-(x.t+9e5);
  const res={pair,label:s.label,plain:s.dir?(s.dir>0?"Possible buy":"Possible sell"):"Wait. "+plainWait(s.label),verdict:v,fresh:age<20*60000};
  if(s.dir){
    const dist=STOP_ATR*A.a[i],stop=x.c-s.dir*dist,tgt=x.c+s.dir*dist*RR;
    res.dir=s.dir;
    res.text=[
      `Bet: ${betText(pair,s.dir)} over the next few hours.`,
      `${s.dir>0?"Buy":"Sell"} near ${x.c.toFixed(dp)}`,
      `Stop-loss: ${stop.toFixed(dp)} (closes the trade if you're wrong)`,
      `Take-profit: ${tgt.toFixed(dp)} (closes the trade with a gain)`,
      `If neither is hit within 8 hours, close it yourself.`,
      plainVerdict(v,b),
      `Tap to open FX Desk for your trade size. Check the news first.`].join("\n");
  }
  return res;
}
(async()=>{
  if(!KEY||!TOPIC)throw new Error("Add the TWELVE_DATA_KEY and NTFY_TOPIC secrets first.");
  const results=[],errors=[];
  for(let n=0;n<PAIRS.length;n++){
    if(n)await sleep(9000);
    try{const r=await checkPair(PAIRS[n]);results.push(r);console.log(r.pair,"|",r.label,"|",r.verdict.t)}
    catch(e){errors.push(e.message);console.error(e.message)}
  }
  for(const r of results){
    if(!r.dir||!r.fresh)continue;
    if(ONLY_EDGE&&r.verdict.c!=="good")continue;
    await notify(`${r.pair}: possible ${r.dir>0?"BUY":"SELL"}${r.verdict.c==="good"?"":" (practice only)"}`,r.text);
  }
  if(TEST)await notify("FX Desk alerts are working",results.length?results.map(r=>`${r.pair}: ${r.plain}`).join("\n"):"No prices came through. Check the job log.","default");
  if(errors.length)throw new Error(errors.length+" pair(s) failed: "+errors[0]);
})().catch(e=>{console.error(e.message);process.exit(1)});

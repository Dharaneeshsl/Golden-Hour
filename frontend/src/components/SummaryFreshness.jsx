export function summaryStale(updatedAt,now=Date.now()){
 const time=Date.parse(updatedAt);return !Number.isFinite(time)||time>now||now-time>90*24*60*60*1000;
}
export default function SummaryFreshness({updatedAt,patient=false}){
 const stale=summaryStale(updatedAt);
 return <aside role={stale?"alert":"note"}><p>{stale?(patient?"Please review your summary. It has not been updated in the last 90 days or its review date is unavailable.":"Summary may be stale. Confirm current allergies, medications and conditions using usual clinical assessment."):"Patient-reported summary. Confirm details before clinical decisions."}</p>{patient&&<p>Use Edit summary to correct or confirm each field. Empty fields mean unknown; enter “None reported” only when that is what you intend to report.</p>}</aside>;
}

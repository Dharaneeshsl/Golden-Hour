import {beforeEach, afterEach, expect, test, vi} from "vitest";
let request;
beforeEach(async()=>{
  vi.resetModules();
  const values=new Map([["goldenhour_authenticated","true"]]);
  const storage={getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),key:index=>[...values.keys()][index],get length(){return values.size;}};
  vi.stubGlobal("localStorage",storage);
  vi.stubGlobal("window",{localStorage:storage,sessionStorage:storage,dispatchEvent:vi.fn()});
  ({request}=await import("./api"));
});
afterEach(()=>vi.unstubAllGlobals());
const reply=(status,data={})=>({status,ok:status>=200&&status<300,json:async()=>data});
test("concurrent expired reads share refresh and retry with cookies",async()=>{
  let release, refreshes=0;
  const gate=new Promise(resolve=>release=resolve),counts=new Map();
  vi.stubGlobal("fetch",vi.fn(async(url,options)=>{
    expect(options.credentials).toBe("include");
    if(url.endsWith("/refresh")){refreshes++;await gate;return reply(200);}
    const count=counts.get(url)||0;counts.set(url,count+1);
    return reply(count===0?401:200,{ok:true});
  }));
  const a=request("/api/patients/me"),b=request("/api/records/example");
  await vi.waitFor(()=>expect(refreshes).toBe(1));release();
  expect(await Promise.all([a,b])).toEqual([{ok:true},{ok:true}]);
  expect(refreshes).toBe(1);
});
test("refresh denial signs out without retry loop",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>reply(401)));
  await expect(request("/api/patients/me")).rejects.toMatchObject({status:401});
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem("goldenhour_authenticated")).toBeNull();
});
test("temporary refresh outage preserves the session for retry",async()=>{
  vi.stubGlobal("fetch",vi.fn(async url=>reply(url.endsWith("/refresh")?503:401)));
  await expect(request("/api/patients/me")).rejects.toMatchObject({status:503});
  expect(localStorage.getItem("goldenhour_authenticated")).toBe("true");
});
test("clinical retry keeps the idempotency key across renewal",async()=>{
  let count=0;const keys=[];
  vi.stubGlobal("fetch",vi.fn(async(url,options)=>{
    if(url.endsWith("/refresh"))return reply(200);
    keys.push(options.headers["Idempotency-Key"]);return reply(++count===1?401:201,{id:"saved"});
  }));
  expect(await request("/api/records",{method:"POST",body:"{}"})).toEqual({id:"saved"});
  expect(keys[0]).toBeTruthy();expect(keys[1]).toBe(keys[0]);
});

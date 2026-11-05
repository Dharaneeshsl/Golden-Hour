import {test,expect,vi,afterEach} from "vitest";
import {cardUrl,saveOfflineCard,readOfflineCard,OFFLINE_CARD_KEY,CARD_TTL} from "./offlineCard";
const origin="https://hospital.test",token="a".repeat(64);
afterEach(()=>vi.unstubAllGlobals());
function storage(){const data=new Map();return {setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k),removeItem:k=>data.delete(k)};}
test("card parsing rejects other hospitals, unexpected paths and malformed tokens",()=>{
 expect(cardUrl(origin+"/emergency/card#"+token,origin).hash).toBe("#"+token);
 for(const value of ["https://evil.test/emergency/card#"+token,origin+"/emergency/card?x=y#"+token,"javascript:alert(1)",origin+"/emergency/other#"+token,origin+"/emergency/card#oops"])expect(()=>cardUrl(value,origin)).toThrow();
});
test("offline storage contains only token and expiry, expires and removes invalid values",()=>{
 vi.stubGlobal("window",{location:{origin}});const store=storage();
 saveOfflineCard(origin+"/emergency/card#"+token,store,1000);
 expect(JSON.parse(store.getItem(OFFLINE_CARD_KEY))).toEqual({token,expiresAt:1000+CARD_TTL});
 expect(readOfflineCard(store,1001).token).toBe(token);
 expect(readOfflineCard(store,1000+CARD_TTL)).toBeNull();
 expect(store.getItem(OFFLINE_CARD_KEY)).toBeUndefined();
 store.setItem(OFFLINE_CARD_KEY,'invalid');expect(readOfflineCard(store,1000)).toBeNull();
});

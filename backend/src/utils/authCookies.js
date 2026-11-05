function cookieValue(header,name) {
  const pair = (header || "").split(";").find(value=>value.trim().startsWith(name+"="));
  if (!pair) return null;
  try {return decodeURIComponent(pair.trim().slice(name.length+1));} catch {return null;}
}
function accessCookie(token) {
  return "gh_access="+token+"; Path=/; HttpOnly; SameSite=Strict; Max-Age=900"+(process.env.NODE_ENV==="production" ? "; Secure" : "");
}
module.exports={cookieValue,accessCookie};

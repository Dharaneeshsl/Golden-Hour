function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}
function pagination(query = {}) {
  const integer = (value, fallback, max, min) => {
    if (value === undefined) return fallback;
    if (typeof value!=="string" || !/^\d+$/.test(value)) badRequest("Pagination values must be integers");
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number<min || number>max) badRequest("Pagination value out of range");
    return number;
  };
  const page = {limit:integer(query.limit,50,100,1),offset:integer(query.offset,0,100000,0)};
  if (query.cursor !== undefined) {
    if (typeof query.cursor!=="string" || query.cursor.length>512 || query.offset!==undefined) badRequest("Invalid pagination cursor");
    try {page.cursor=JSON.parse(Buffer.from(query.cursor,"base64url").toString("utf8"));}
    catch {badRequest("Invalid pagination cursor");}
    if (!page.cursor || typeof page.cursor.id!=="string" || page.cursor.id.length>128 ||
        typeof page.cursor.time!=="string" || !Number.isFinite(Date.parse(page.cursor.time))) badRequest("Invalid pagination cursor");
  }
  return page;
}
function pageResponse(res, rows, page, timeField="createdAt") {
  const items = rows.slice(0,page.limit);
  if (rows.length>page.limit && items.length) {
    const last = items.at(-1);
    const time = last[timeField] || last.created_at || last.timestamp;
    if (time) res.setHeader("X-Next-Cursor",Buffer.from(JSON.stringify({time:new Date(time).toISOString(),id:last.id})).toString("base64url"));
  }
  return res.json(items);
}
function memoryPage(rows,page,timeField="createdAt") {
  const sorted = [...rows].sort((a,b) => {
    const delta = Date.parse(b[timeField] || b.created_at || b.timestamp || 0)-Date.parse(a[timeField] || a.created_at || a.timestamp || 0);
    return delta || String(b.id).localeCompare(String(a.id));
  });
  const filtered = page.cursor ? sorted.filter(row => {
    const time = Date.parse(row[timeField] || row.created_at || row.timestamp || 0);
    return time<Date.parse(page.cursor.time) || (time===Date.parse(page.cursor.time) && String(row.id)<page.cursor.id);
  }) : sorted;
  return filtered.slice(page.offset,page.offset+page.limit+1);
}
module.exports={pagination,pageResponse,memoryPage,badRequest};

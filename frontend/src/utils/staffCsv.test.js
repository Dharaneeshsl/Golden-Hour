import {test,expect} from "vitest";
import {parseStaffCsv,reviewAge} from "./staffCsv";
test("staff preview rejects wrong schema, invalid numbers and repeated rows",()=>{
 const rows=parseStaffCsv('phone\n+919876543210\n"+919876543210"\n=bad\n+918765432109');
 expect(rows[0].error).toBeNull();expect(rows[1].error).toBe("Duplicate row");expect(rows[2].error).toBeTruthy();expect(rows[3].error).toBeNull();
 expect(()=>parseStaffCsv('name,phone\na,+919876543210')).toThrow();
 expect(()=>parseStaffCsv('phone\n'+Array(101).fill('+919876543210').join('\n'))).toThrow();
 expect(()=>parseStaffCsv('a'.repeat(65537))).toThrow();
});
test("review age labels missing dates and overdue reviews",()=>{
 expect(reviewAge('invalid')).toBe('Review date unavailable');
 expect(reviewAge('2026-01-01T00:00:00Z',Date.parse('2026-01-02T01:00:00Z'))).toContain('Over 24-hour review target');
});

// Phone-only browser flow. The SMS transport is captured in-process; the real OTP service verifies every code.
const assert = require("node:assert/strict");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const express = require("express");
const {chromium} = require("playwright");

const {Pool} = require("pg");
const {totp} = require("../src/services/mfaService");

async function run() {
  assert.ok(process.env.DATABASE_URL,"Supply a disposable database");
  // Build explicitly for this same-origin fixture, regardless of a developer's local .env.
  require("child_process").execFileSync(process.execPath,[
    path.resolve(__dirname,"../../frontend/node_modules/vite/bin/vite.js"),"build"
  ],{cwd:path.resolve(__dirname,"../../frontend"),env:{...process.env,NODE_ENV:"production",VITE_API_URL:"/",RAYON_NUM_THREADS:"1"},stdio:"inherit"});
  process.env.NODE_ENV = "test";
  process.env.REQUIRE_STAFF_MFA = "true";
  process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex");
  process.env.ENCRYPTION_KEY = process.env.RESTORE_TEST_KEY || crypto.randomBytes(32).toString("base64");
  const phone = () => "+91"+String(9000000000+crypto.randomInt(0,1000000000));
  const admin={phone:phone()},doctor={phone:phone()},patient={phone:phone()};
  process.env.ADMIN_WALLETS="";
  process.env.STAFF_INVITE_ONLY="true";
  const codes=new Map();
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  const {PostgresStore} = require("../src/config/db");
  const {createApp} = require("../src/app");
  const server = http.createServer();
  let browser;
  try {
    await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    process.env.FRONTEND_ORIGIN = origin;
    const store=new PostgresStore(pool);
    const adminUser=await require("../src/services/phoneAuthService").ensurePhoneUser(store,admin.phone);
    process.env.ADMIN_USER_IDS=adminUser.id;
    const app = await createApp({store,chain:{enabled:false},otpProvider:{send:async ({phone,code})=>codes.set(phone,code)}});
    const dist = path.resolve(__dirname,"../../frontend/dist");
    app.use(express.static(dist));
    app.get("*",(_req,res) => res.sendFile(path.join(dist,"index.html")));
    server.on("request",app);
    browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || "chrome",headless:true});
    async function actor(account, mobile = false) {
      const context = await browser.newContext(mobile ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true} : {});
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on("pageerror",err => errors.push(err.message));
      return {context,page,errors};
    }
    const p = await actor(patient,true), d = await actor(doctor), a = await actor(admin);
    async function signIn(actor,account) {
      const page=actor.page;
      await page.goto(origin+"/login");
      await page.getByLabel("Mobile number").fill(account.phone);
      await page.getByRole("button",{name:"Request sign-in code",exact:true}).click();
      await page.getByLabel("SMS verification code").waitFor();
      await page.getByLabel("SMS verification code").fill(codes.get(account.phone));
      await page.getByRole("button",{name:"Verify code",exact:true}).click();
      await page.waitForFunction(()=>document.querySelector("code") || localStorage.getItem("goldenhour_authenticated"));
      if (await page.locator("code").count()) {
        const secret=await page.locator("code").textContent();
        await page.getByLabel("Authenticator or recovery code").fill(totp(secret,"staff").generate());
        await page.getByRole("button",{name:"Verify code",exact:true}).click();
        await page.getByRole("button",{name:"I saved my codes. Continue",exact:true}).click();
      }
      await page.waitForFunction(()=>localStorage.getItem("goldenhour_authenticated")==="true");
      assert.equal(await page.evaluate(()=>localStorage.getItem("goldenhour_token")),null);
      assert.equal((await actor.context.cookies()).find(cookie=>cookie.name==="gh_access").httpOnly,true);
    }
    await signIn(a,admin);
    const importPhone=phone();
    await a.page.getByLabel("Staff CSV").setInputFiles({name:"synthetic-staff.csv",mimeType:"text/csv",buffer:Buffer.from("phone\n"+importPhone+"\n"+importPhone+"\ninvalid")});
    await a.page.getByText("Duplicate row",{exact:true}).waitFor();
    await a.page.getByRole("button",{name:"Create invitations for valid rows",exact:true}).click();
    await a.page.getByText(/Created .*expires/).waitFor();
    await a.page.getByLabel("Invite a clinician mobile number").fill(doctor.phone);
    await a.page.getByRole("button",{name:"Create invitation",exact:true}).click();
    const invitation=await a.page.locator("form code").textContent();
    await signIn(p,patient);
    await p.page.getByLabel("Full Name",{exact:true}).fill("Synthetic browser patient");
    await p.page.getByLabel("Blood Group",{exact:true}).fill("O+");
    await p.page.getByLabel("Allergies",{exact:true}).fill("Synthetic allergy");
    await p.page.getByRole("button",{name:"Create Patient Profile",exact:true}).click();
    await p.page.getByRole("heading",{name:"Provider Consent Management"}).waitFor();

    await signIn(d,doctor);
    await d.page.getByRole("button",{name:"Register as Healthcare Provider"}).click();
    await d.page.getByLabel("Full Name",{exact:true}).fill("Synthetic browser doctor");
    await d.page.getByLabel("Hospital invitation code").fill(invitation);
    await d.page.getByLabel("Medical License Number").fill("SYNTHETIC-BROWSER");
    await d.page.getByLabel("Medical Specialty").fill("Emergency");
    await d.page.getByRole("button",{name:"Submit Provider Registration for Approval"}).click();
    // Newly registered staff must reauthenticate with MFA.
    await d.page.waitForURL("**/login");
    await signIn(d,doctor);

    await a.page.reload();
    await a.page.getByRole("button",{name:"Approve Provider",exact:true}).click();
    await a.page.getByText("No providers in pending state.").waitFor();
    await p.page.getByPlaceholder("Clinician mobile number (+91…)").fill(doctor.phone);
    await p.page.getByRole("button",{name:"Grant Consent",exact:true}).click();
    await p.page.getByText("ACTIVE",{exact:true}).waitFor();
    await d.page.reload();
    const patientRow = d.page.getByRole("button",{name:/Patient .*\.\.\./}).first();
    await patientRow.click();
    await d.page.getByLabel("Clinical Data (JSON)").fill(JSON.stringify({note:"Browser clinical record"}));
    const saved = d.page.waitForResponse(response => response.url().endsWith("/api/records") && response.request().method()==="POST");
    await d.page.getByRole("button",{name:"Encrypt & Save Record",exact:true}).click();
    const saveResult = await saved;
    assert.equal(saveResult.status(),201,await saveResult.text());
    await d.page.getByRole("button",{name:"View",exact:true}).click();
    assert.match(await d.page.locator(".record-detail").textContent(),/Browser clinical record/);
    await p.page.getByRole("button",{name:"Revoke Access",exact:true}).click();
    await p.page.getByText("REVOKED",{exact:true}).waitFor();
    await d.page.getByRole("button",{name:"View",exact:true}).click();
    await d.page.getByText("Patient consent required for record access").waitFor();
    assert.equal(await d.page.locator(".record-detail").count(),0);

    const cardResponse = p.page.waitForResponse(response => response.url().endsWith("/api/patients/me/card"));
    await p.page.getByRole("button",{name:"Issue replacement or first card",exact:true}).click();
    const card = await (await cardResponse).json();
    await d.page.goto(origin + "/emergency/card#" + card.token);
    await d.page.getByRole("checkbox",{name:"I confirmed patient identity using hospital procedure."}).check();
    await d.page.getByPlaceholder("Detailed emergency justification for auditing...").fill("Synthetic emergency browser drill");
    await d.page.getByRole("button",{name:"Trigger Logged Emergency Access",exact:true}).click();
    await d.page.getByRole("button",{name:"View Critical Patient Data →",exact:true}).click();
    await d.page.getByText("Synthetic allergy",{exact:true}).waitFor();
    await a.page.getByRole("button",{name:"Pending reviews",exact:true}).click();
    await a.page.getByRole("button",{name:"Approve access",exact:true}).first().click();

    await a.page.getByRole("button",{name:"Emergency Access Audits",exact:true}).click();
    const csvDownload=a.page.waitForEvent("download");
    await a.page.getByRole("button",{name:"Download audit CSV",exact:true}).click();
    assert.match((await csvDownload).suggestedFilename(),/\.csv$/);
    const pdfDownload=a.page.waitForEvent("download");
    await a.page.getByRole("button",{name:"Download audit PDF and verification report",exact:true}).click();
    assert.match((await pdfDownload).suggestedFilename(),/\.pdf$/);
    for (const actor of [p,d,a]) assert.deepEqual(actor.errors,[]);
    console.info("Browser workflow passed: mobile patient enrollment, phone OTP, cookie sessions, staff MFA, verification, consent, record retrieval, revocation, QR access and review.");
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
}
run().catch(err => {console.error(err);process.exitCode=1;});

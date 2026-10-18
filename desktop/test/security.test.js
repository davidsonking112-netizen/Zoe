"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeUrl,resolveAddressInput,isAllowedNavigation,isAllowedModelEndpoint,isPrivateHost,actionRequiresApproval,assertPublicHttpUrl,assertSafeAIUrl,sanitizeDownloadFilename,allocateDownloadPath}=require("../security");

test("normalizes domain searches and URLs",()=>{
  assert.equal(normalizeUrl("example.com"),"https://example.com/");
  assert.equal(normalizeUrl("http://example.com/path"),"http://example.com/path");
});
test("rejects unsupported protocols and embedded credentials",()=>{
  assert.throws(()=>normalizeUrl("file:///etc/passwd"));
  assert.throws(()=>normalizeUrl("javascript:alert(1)"));
  assert.throws(()=>normalizeUrl("https://user:pass@example.com"));
  assert.equal(isAllowedNavigation("data:text/html,hi"),false);
});
test("blocks private and loopback destinations",()=>{
  for(const host of ["localhost","127.0.0.1","10.0.0.2","192.168.1.1","172.20.0.1","169.254.169.254","service.local"]) assert.equal(isPrivateHost(host),true,host);
  for(const host of ["example.com","8.8.8.8"]) assert.equal(isPrivateHost(host),false,host);
});
test("allows secure external and local loopback model endpoints only",()=>{
  assert.equal(isAllowedModelEndpoint("https://api.example.com/v1/chat/completions"),true);
  assert.equal(isAllowedModelEndpoint("http://127.0.0.1:11434/v1/chat/completions"),true);
  assert.equal(isAllowedModelEndpoint("http://192.168.1.5:11434/v1/chat/completions"),false);
  assert.equal(isAllowedModelEndpoint("http://api.example.com/v1/chat/completions"),false);
});


test("address bar opens URLs and searches ordinary text",()=>{
  assert.equal(resolveAddressInput("example.com"),"https://example.com/");
  assert.equal(resolveAddressInput("localhost:3000"),"http://localhost:3000/");
  assert.equal(resolveAddressInput("best coffee near me"),"https://www.google.com/search?q=best%20coffee%20near%20me");
  assert.equal(resolveAddressInput("cats"),"https://www.google.com/search?q=cats");
  assert.equal(resolveAddressInput("127.0.0.1:8080"),"http://127.0.0.1:8080/");
  assert.equal(resolveAddressInput("192.168.1.1"),"http://192.168.1.1/");
  assert.equal(resolveAddressInput("https://example.com/a"),"https://example.com/a");
});

test("blocks additional special IPv6 destinations for AI navigation",()=>{
  for(const host of ["fc00::1","fd12::1","fe80::1","ff02::1","2001:db8::1","::ffff:7f00:1","::ffff:0a00:1"]) {
    assert.equal(isPrivateHost(host),true,host);
  }
  assert.equal(isPrivateHost("2606:4700:4700::1111"),false);
});

test("classifies consequential clicks and sensitive fills for human approval",()=>{
  assert.equal(actionRequiresApproval({type:"click",name:"Continue to checkout"}),true);
  assert.equal(actionRequiresApproval({type:"click",name:"Run search"}),false);
  assert.equal(actionRequiresApproval({type:"click",name:"Save",elementType:"submit"}),true);
  assert.equal(actionRequiresApproval({type:"fill",name:"Account password",inputType:"password"}),true);
  assert.equal(actionRequiresApproval({type:"fill",name:"Search",inputType:"text"}),false);
});


test("approval policy covers form submits, sensitive autocomplete, and consequential destinations",()=>{
  assert.equal(actionRequiresApproval({type:"click",name:"Continue",elementType:"submit"}),true);
  assert.equal(actionRequiresApproval({type:"click",name:"Continue",href:"https://shop.example/checkout"}),true);
  assert.equal(actionRequiresApproval({type:"click",name:"Proceed",formSubmit:true}),true);
  assert.equal(actionRequiresApproval({type:"fill",name:"Card details",inputType:"text",autocomplete:"cc-number"}),true);
  assert.equal(actionRequiresApproval({type:"fill",name:"Search",inputType:"text",autocomplete:"off"}),false);
  assert.equal(actionRequiresApproval({type:"unknown"}),true);
});


test("blocks special-purpose IPv4 ranges from AI navigation",()=>{
  for(const host of ["100.64.0.1","100.127.255.254","192.0.0.1","192.0.2.1","192.88.99.1","198.18.0.1","198.19.255.254","198.51.100.1","203.0.113.1","240.0.0.1"]) {
    assert.equal(isPrivateHost(host),true,host);
  }
});

test("consequential approval policy catches autocomplete and form metadata",()=>{
  assert.equal(actionRequiresApproval({type:"fill",inputType:"text",autocomplete:"cc-number"}),true);
  assert.equal(actionRequiresApproval({type:"fill",inputType:"text",autocomplete:"one-time-code"}),true);
  assert.equal(actionRequiresApproval({type:"click",formSubmit:true,name:"Continue"}),true);
  assert.equal(actionRequiresApproval({type:"click",href:"https://shop.example/checkout",name:"Continue"}),true);
  assert.equal(actionRequiresApproval({type:"inspect"}),true);
});


test("approval policy covers sensitive upload and scheduling fields",()=>{
  assert.equal(actionRequiresApproval({type:"fill",inputType:"file"}),true);
  assert.equal(actionRequiresApproval({type:"fill",inputType:"datetime-local"}),true);
  assert.equal(actionRequiresApproval({type:"click",name:"Save changes",role:"button"}),true);
});


test("AI public-destination validation rejects private DNS answers and permits public ones", async () => {
  let lookups = 0;
  const publicLookup = async () => {
    lookups += 1;
    return [{ address: "93.184.216.34", family: 4 }];
  };
  assert.equal(await assertPublicHttpUrl("https://example.com/path", publicLookup), "https://example.com/path");
  assert.equal(lookups, 1);
  await assert.rejects(assertPublicHttpUrl("http://127.0.0.1:8000", publicLookup), /public HTTP/);
  assert.equal(lookups, 1, "literal private addresses should be blocked before DNS lookup");
  await assert.rejects(
    assertPublicHttpUrl("https://mixed.example", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.4", family: 4 }
    ]),
    /private or reserved/
  );
  await assert.rejects(
    assertPublicHttpUrl("https://unresolved.example", async () => { throw new Error("DNS failed"); }),
    /could not verify/
  );
});

test("AI URL guard rejects private literal addresses before navigation", async () => {
  await assert.rejects(assertSafeAIUrl("http://127.0.0.1:8080"), /public HTTP/);
  await assert.rejects(assertSafeAIUrl("http://[::1]:8080"), /public HTTP/);
  assert.equal(await assertSafeAIUrl("https://8.8.8.8"), "https://8.8.8.8/");
});

test("AI URL guard rejects DNS answers that include private or reserved IPs", async () => {
  const lookupMixed = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.5", family: 4 }
  ];
  await assert.rejects(assertSafeAIUrl("https://example.test", lookupMixed), /private or reserved/);
});

test("AI URL guard accepts only verifiably public DNS answers", async () => {
  const lookupPublic = async hostname => {
    assert.equal(hostname, "example.test");
    return [{ address: "93.184.216.34", family: 4 }];
  };
  assert.equal(await assertSafeAIUrl("https://example.test", lookupPublic), "https://example.test/");
  await assert.rejects(assertSafeAIUrl("https://example.test", async () => { throw new Error("DNS unavailable"); }), /could not verify/);
});


test("download filenames cannot escape the Downloads directory", () => {
  assert.equal(sanitizeDownloadFilename("../../secret.txt"), "secret.txt");
  assert.equal(sanitizeDownloadFilename(".."), "download");
  const windowsStyle = sanitizeDownloadFilename("C:\\Users\\evil?.exe");
  assert.equal(windowsStyle.includes("/"), false);
  assert.equal(windowsStyle.includes("\\"), false);
});

test("download path allocation avoids existing and concurrently reserved filenames", () => {
  const reserved = new Set();
  const existing = new Set(["/tmp/zoe-downloads/report.pdf"]);
  const exists = filename => existing.has(filename);
  const first = allocateDownloadPath("/tmp/zoe-downloads", "report.pdf", exists, reserved);
  const second = allocateDownloadPath("/tmp/zoe-downloads", "report.pdf", exists, reserved);
  assert.equal(first.filename, "report.pdf");
  assert.equal(first.destination, "/tmp/zoe-downloads/report (1).pdf");
  assert.equal(second.destination, "/tmp/zoe-downloads/report (2).pdf");
});


test("redacts credential-like URL parameters before AI page context is shared", () => {
  const redacted = redactSensitiveUrl("https://example.com/account?access_token=secret-value&tab=home#id_token=fragment-secret");
  const parsed = new URL(redacted);
  assert.equal(parsed.searchParams.get("access_token"), "[redacted]");
  assert.equal(parsed.searchParams.get("tab"), "home");
  assert.equal(parsed.hash, "#[redacted]");
  assert.equal(redacted.includes("secret-value"), false);
  assert.equal(redacted.includes("fragment-secret"), false);
  assert.equal(redactSensitiveUrl("https://example.com/#/settings"), "https://example.com/#/settings");
});

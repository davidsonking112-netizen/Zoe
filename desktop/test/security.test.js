"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeUrl,resolveAddressInput,isAllowedNavigation,isAllowedModelEndpoint,isPrivateHost,actionRequiresApproval}=require("../security");

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

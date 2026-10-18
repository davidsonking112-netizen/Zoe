"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeUrl,isAllowedNavigation,isAllowedModelEndpoint,isPrivateHost}=require("../security");

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

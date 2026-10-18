"use strict";
const $=id=>document.getElementById(id);
let state={tabs:[],activeTabId:null,aiPanelVisible:true};
let toastTimer;
function toast(message,isError=true){$("toast").textContent=message;$("toast").classList.toggle("notice",!isError);$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),5000);}
function renderTabs(){const root=$("tabs");root.replaceChildren();for(const tab of state.tabs){const button=document.createElement("button");button.className="tab"+(tab.id===state.activeTabId?" active":"");button.title=tab.url||tab.title;const title=document.createElement("span");title.className="tab-title";title.textContent=tab.title||"New tab";button.append(title);button.addEventListener("click",()=>window.zoe.selectTab(tab.id).catch(e=>toast(e.message)));const close=document.createElement("span");close.className="tab-close";close.textContent="×";close.title="Close tab";close.addEventListener("click",event=>{event.stopPropagation();window.zoe.closeTab(tab.id).catch(e=>toast(e.message));});button.append(close);root.append(button);}const active=state.tabs.find(t=>t.id===state.activeTabId);if(active){$("address").value=active.url||"";$("back").disabled=!active.canGoBack;$("forward").disabled=!active.canGoForward;$("reload").textContent=active.loading?"…":"↻";}}
function setPanel(visible){state.aiPanelVisible=visible;$("assistant").classList.toggle("hidden",!visible);$("toggle-ai").classList.toggle("active",visible);}
function appendMessage(text,role="assistant"){const node=document.createElement("div");node.className="bubble "+(role==="user"?"user-bubble":role==="tool"?"tool-bubble":"assistant-bubble");node.textContent=text;$("chat").append(node);$("chat").scrollTop=$("chat").scrollHeight;return node;}
window.zoe.onState(next=>{state=next;renderTabs();setPanel(state.aiPanelVisible);});
window.zoe.onError(message=>toast(message,true));
window.zoe.onFocusAddress(()=>{$("address").focus();$("address").select();});
window.zoe.onNotice(message=>toast(message,false));
window.zoe.onDownloadProgress(progress=>{const status=$("download-status");if(!status)return;if(progress.state!=="progressing"){status.textContent="";return;}const total=Number(progress.totalBytes)||0;const received=Number(progress.receivedBytes)||0;status.textContent=total>0?"Downloading "+Math.floor(received/total*100)+"%":"Downloading…";});
window.zoe.getState().then(next=>{state=next;renderTabs();setPanel(state.aiPanelVisible);}).catch(e=>toast(e.message));
$("address-form").addEventListener("submit",async e=>{e.preventDefault();try{await window.zoe.navigate($("address").value.trim());}catch(err){toast(err.message);}});
$("back").addEventListener("click",()=>window.zoe.back().catch(e=>toast(e.message)));
$("forward").addEventListener("click",()=>window.zoe.forward().catch(e=>toast(e.message)));
$("reload").addEventListener("click",()=>window.zoe.reload().catch(e=>toast(e.message)));
$("new-tab").addEventListener("click",()=>window.zoe.newTab("https://www.google.com").catch(e=>toast(e.message)));
$("toggle-ai").addEventListener("click",()=>window.zoe.toggleAI().catch(e=>toast(e.message)));
$("hide-ai").addEventListener("click",()=>window.zoe.toggleAI().catch(e=>toast(e.message)));
$("save-ai").addEventListener("click",async()=>{try{const result=await window.zoe.configureAI({endpoint:$("endpoint").value.trim(),model:$("model").value.trim(),apiKey:$("api-key").value});$("api-key").value="";$("settings-status").textContent="Applied. Key remains in memory only.";appendMessage("AI configured for "+result.model+".","tool");}catch(e){$("settings-status").textContent=e.message;}});
$("chat-form").addEventListener("submit",async e=>{e.preventDefault();const text=$("prompt").value.trim();if(!text)return;$("prompt").value="";appendMessage(text,"user");const pending=appendMessage("Thinking…");$("send").disabled=true;try{const result=await window.zoe.askAI(text);pending.remove();appendMessage(result.text||"Done.");if(result.page)appendMessage("Current page: "+result.page.title+"\n"+result.page.url,"tool");}catch(err){pending.remove();appendMessage("I couldn't complete that request: "+err.message); }finally{$("send").disabled=false;}});
$("prompt").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chat-form").requestSubmit();}});


document.addEventListener("keydown",event=>{
  const modifier=event.ctrlKey||event.metaKey;
  if(!modifier)return;
  const key=event.key.toLowerCase();
  if(key==="l"){
    event.preventDefault();
    $("address").focus();
    $("address").select();
  }else if(key==="t"){
    event.preventDefault();
    window.zoe.newTab("https://www.google.com").catch(e=>toast(e.message));
  }else if(key==="w"){
    event.preventDefault();
    if(state.activeTabId)window.zoe.closeTab(state.activeTabId).catch(e=>toast(e.message));
  }else if(key==="r"){
    event.preventDefault();
    window.zoe.reload().catch(e=>toast(e.message));
  }
});

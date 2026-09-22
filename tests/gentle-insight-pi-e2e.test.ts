import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import gentleInsight, { INSIGHT_WIDGET_KEY } from "../extensions/gentle-insight.ts";

const cost={input:0,output:0,cacheRead:0,cacheWrite:0,total:0};

test("real Pi runtime loads Gentle Insight and drives model-backed explanation", {timeout:30000}, async t=>{
 const sdk=await import("@earendil-works/pi-coding-agent");
 const ai=await import("@earendil-works/pi-ai");
 const root=mkdtempSync(join(tmpdir(),"gentle-insight-e2e-")); t.after(()=>rmSync(root,{recursive:true,force:true}));
 const runtimeModels=await sdk.ModelRuntime.create({credentials:new ai.InMemoryCredentialStore(),modelsPath:join(root,"models.json"),modelsStorePath:join(root,"models-store.json"),allowModelNetwork:false});
 const settings=sdk.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}});
 let call=0;
 const runtime=await sdk.createAgentSessionRuntime(async({cwd,sessionManager,sessionStartEvent})=>{
  const services=await sdk.createAgentSessionServices({cwd,agentDir:root,modelRuntime:runtimeModels,settingsManager:settings,resourceLoaderOptions:{noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,extensionFactories:[
   pi=>pi.registerProvider("insight-control",{baseUrl:"http://127.0.0.1:1",apiKey:"offline",api:"openai-completions",models:[{id:"control",name:"control",reasoning:false,input:["text"],cost,contextWindow:200000,maxTokens:1000}],streamSimple:(model,context)=>{
    const text=call++===0?"I will inspect the fixture.":'{"title":"Comprobando el cambio","explanation":"Está verificando el resultado con una prueba controlada.","why":"La comprobación aporta evidencia antes de dar el trabajo por terminado.","language":"es"}';
    const message:AssistantMessage={role:"assistant",content:[{type:"text",text}],api:model.api,provider:model.provider,model:model.id,usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost},stopReason:"stop",timestamp:Date.now()};
    const stream=ai.createAssistantMessageEventStream();queueMicrotask(()=>{stream.push({type:"start",partial:message});stream.push({type:"done",reason:"stop",message});stream.end(message);});return stream;
   }}),
   gentleInsight,
   pi=>pi.on("session_start",(_e,ctx)=>{(globalThis as any).__insightCtx=ctx;})
  ]}});
  return {...(await sdk.createAgentSessionFromServices({services,sessionManager,sessionStartEvent,model:runtimeModels.getModel("insight-control","control"),tools:[]})),services,diagnostics:services.diagnostics};
 },{cwd:root,agentDir:root,sessionManager:sdk.SessionManager.inMemory()});
 const session=runtime.session;
 await session.prompt("Inspect the fixture.");
 await new Promise(r=>setTimeout(r,50));
 const ctx=(globalThis as any).__insightCtx;
 assert.ok(ctx,"real Pi session_start reached the extension");
 assert.ok(call>=2,"active Pi model handled both agent and Insight explanation");
 // The extension loaded in the real SDK lifecycle without provider network access.
 assert.ok(runtime.session);
 delete (globalThis as any).__insightCtx;
});

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import gentleInsight from "../extensions/gentle-insight.ts";

const cost={input:0,output:0,cacheRead:0,cacheWrite:0,total:0};

test("real Pi runtime loads Gentle Insight and drives model-backed explanation", {timeout:30000}, async t=>{
 const sdk=await import("@earendil-works/pi-coding-agent");
 const ai=await import("@earendil-works/pi-ai");
 const root=mkdtempSync(join(tmpdir(),"gentle-insight-e2e-")); t.after(()=>rmSync(root,{recursive:true,force:true}));
 const runtimeModels=await sdk.ModelRuntime.create({credentials:new ai.InMemoryCredentialStore(),modelsPath:join(root,"models.json"),modelsStorePath:join(root,"models-store.json"),allowModelNetwork:false});
 const settings=sdk.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}});
 let agentCalls=0, insightCalls=0, insightPrompt="";
 const runtime=await sdk.createAgentSessionRuntime(async({cwd,sessionManager,sessionStartEvent})=>{
  const services=await sdk.createAgentSessionServices({cwd,agentDir:root,modelRuntime:runtimeModels,settingsManager:settings,resourceLoaderOptions:{noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,extensionFactories:[
   pi=>pi.registerProvider("insight-control",{baseUrl:"http://127.0.0.1:1",apiKey:"offline",api:"openai-completions",models:[{id:"control",name:"control",reasoning:false,input:["text"],cost,contextWindow:200000,maxTokens:1000}],streamSimple:(model,context)=>{
    const serialized=JSON.stringify(context);
    const isInsight=serialized.includes("You are Gentle Insight");
    if(isInsight){insightCalls++;insightPrompt=serialized;}else agentCalls++;
    const text=isInsight?'{"title":"Comprobando el cambio","explanation":"Está verificando el resultado con una prueba controlada.","why":"La comprobación aporta evidencia antes de dar el trabajo por terminado.","language":"es"}':"Controlled agent response.";
    const message:AssistantMessage={role:"assistant",content:[{type:"text",text}],api:model.api,provider:model.provider,model:model.id,usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost},stopReason:"stop",timestamp:Date.now()};
    const stream=ai.createAssistantMessageEventStream();queueMicrotask(()=>{stream.push({type:"start",partial:message});stream.push({type:"done",reason:"stop",message});stream.end(message);});return stream;
   }}),
   gentleInsight,
  ]}});
  assert.deepEqual(services.resourceLoader.getExtensions().errors,[],"Gentle Insight must load through Pi's real resource loader");
  return {...(await sdk.createAgentSessionFromServices({services,sessionManager,sessionStartEvent,model:runtimeModels.getModel("insight-control","control"),tools:[]})),services,diagnostics:services.diagnostics};
 },{cwd:root,agentDir:root,sessionManager:sdk.SessionManager.inMemory()});
 await runtime.session.prompt("Inspect the fixture.");
 for(let i=0;i<50&&insightCalls===0;i++) await new Promise(r=>setTimeout(r,10));
 assert.equal(agentCalls,1,"the real Pi session used the controlled active model");
 assert.ok(insightCalls>=1,"Gentle Insight requested an explanation through the active Pi model");
 assert.match(insightPrompt,/observable facts/i,"the side call remains bounded to observable facts");
 assert.match(insightPrompt,/Never reveal or infer chain-of-thought/i,"the safety boundary reaches the actual model call");
});

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Context, Model, SimpleStreamOptions, TextContent } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import { CARD_TONE, renderCard } from "../lib/shell-card.ts";
import { InsightTracker, INSIGHT_PHASE, insightPrompt, parseInsightNarrative, type InsightSnapshot } from "../lib/gentle-insight.ts";

export const INSIGHT_WIDGET_KEY="gentle-insight";
export const INSIGHT_COMMAND_NAME="gentle:insight";
interface InsightSession { tracker:InsightTracker; enabled:boolean; generation:number; }

function sessionKey(ctx:ExtensionContext){return ctx.sessionManager.getSessionId();}
function stats(s:InsightSnapshot){const p:string[]=[]; if(s.filesChanged)p.push(`${s.filesChanged} file${s.filesChanged===1?"":"s"} changed`); if(s.problemsSeen)p.push(`${s.problemsSeen} problem${s.problemsSeen===1?"":"s"} observed`); if(s.problemsResolved)p.push(`${s.problemsResolved} later resolved`); return p.join(" · ");}
function tone(s:InsightSnapshot){return s.phase===INSIGHT_PHASE.PROBLEM?CARD_TONE.WARNING:s.phase===INSIGHT_PHASE.DONE?CARD_TONE.SUCCESS:CARD_TONE.INFO;}
export function insightCard(s:InsightSnapshot){
	const body=[s.narrative.title,"",s.narrative.explanation,"",`WHY · ${s.narrative.why}`,"","FACTS"];
	for(const fact of s.facts.slice(-4))body.push(`• ${fact.text}`);
	const summary=stats(s); if(summary)body.push("",summary);
	body.push("",s.narrative.source==="model"?`AI explanation · ${s.narrative.language}`:"Safe fallback · model explanation unavailable");
	return {title:"Gentle Insight",subtitle:"understand the work, not the logs",body,tone:tone(s),glyph:"✦"};
}
function assistantText(message:AssistantMessage):string{return message.content.filter((part):part is TextContent=>part.type==="text").map(part=>part.text).join("").trim();}
async function generateNarrative(ctx:ExtensionContext,tracker:InsightTracker,signal?:AbortSignal){
	const model=ctx.model as Model<Api>|undefined; if(!model||!ctx.modelRegistry)return undefined;
	const auth=await ctx.modelRegistry.getApiKeyAndHeaders(model); if(!auth.ok)return undefined;
	const context:Context={messages:[{role:"user",content:[{type:"text",text:insightPrompt(tracker.context)}],timestamp:Date.now()}]};
	const options:SimpleStreamOptions={apiKey:auth.apiKey,headers:auth.headers,signal};
	return parseInsightNarrative(assistantText(await completeSimple(model,context,options)));
}
export default function gentleInsight(pi:ExtensionAPI){
	const sessions=new Map<string,InsightSession>();
	const state=(ctx:ExtensionContext)=>{const key=sessionKey(ctx);let s=sessions.get(key);if(!s){s={tracker:new InsightTracker(),enabled:true,generation:0};sessions.set(key,s);}return s;};
	const show=(ctx:ExtensionContext)=>{if(!ctx.hasUI)return;const s=state(ctx);if(!s.enabled){ctx.ui.setWidget(INSIGHT_WIDGET_KEY,undefined);return;}const card=insightCard(s.tracker.snapshot);ctx.ui.setWidget(INSIGHT_WIDGET_KEY,(_tui,theme)=>({render:(width:number)=>renderCard(card,theme,width,{expanded:true}),invalidate(){},dispose(){}}));};
	const explain=async(ctx:ExtensionContext)=>{const s=state(ctx);if(!s.enabled)return;const revision=s.tracker.snapshot.revision;const generation=++s.generation;try{const narrative=await generateNarrative(ctx,s.tracker);if(generation!==s.generation||!narrative)return;s.tracker.applyNarrative(narrative,revision);show(ctx);}catch{/* deterministic fallback remains visible */}};
	const meaningful=(before:InsightSnapshot,after:InsightSnapshot)=>before.phase!==after.phase||after.phase===INSIGHT_PHASE.PROBLEM||after.phase===INSIGHT_PHASE.DONE;
	pi.registerCommand(INSIGHT_COMMAND_NAME,{description:"Show or hide the AI-generated plain-language explanation of Gentle's observable work.",handler:async(_args,ctx)=>{const s=state(ctx);s.enabled=!s.enabled;s.generation++;show(ctx);if(ctx.hasUI)ctx.ui.notify(`Gentle Insight ${s.enabled?"enabled":"hidden"}.`,"info");}});
	pi.on("session_start",(_e,ctx)=>show(ctx));
	pi.on("before_agent_start",(_e,ctx)=>{state(ctx).tracker.beginTurn();show(ctx);void explain(ctx);});
	pi.on("tool_execution_start",(event,ctx)=>{const s=state(ctx);const before=s.tracker.snapshot;const after=s.tracker.toolStarted({name:event.toolName,args:event.args as Record<string,unknown>|undefined});show(ctx);if(meaningful(before,after))void explain(ctx);});
	pi.on("tool_execution_end",(event,ctx)=>{const s=state(ctx);const before=s.tracker.snapshot;const after=s.tracker.toolEnded({name:event.toolName,isError:event.isError});show(ctx);if(meaningful(before,after))void explain(ctx);});
	pi.on("agent_end",(_e,ctx)=>{const s=state(ctx);s.tracker.finish();show(ctx);void explain(ctx);});
	pi.on("session_shutdown",(_e,ctx)=>{const key=sessionKey(ctx);const s=sessions.get(key);if(s)s.generation++;sessions.delete(key);});
}

import assert from "node:assert/strict";
import test from "node:test";
import { InsightTracker, INSIGHT_PHASE, insightPrompt, parseInsightNarrative } from "../lib/gentle-insight.ts";
import gentleInsight, { INSIGHT_COMMAND_NAME, INSIGHT_WIDGET_KEY } from "../extensions/gentle-insight.ts";

test("tracker keeps verified facts separate from explanatory narrative",()=>{
	const tracker=new InsightTracker(); tracker.beginTurn();
	let state=tracker.toolStarted({name:"edit",args:{path:"extensions/example.ts"}});
	assert.equal(state.phase,INSIGHT_PHASE.CHANGING); assert.equal(state.filesChanged,1); assert.match(state.facts.at(-1)?.text??"",/extensions\/example\.ts/);
	state=tracker.toolStarted({name:"bash",args:{command:"pnpm test"}});
	assert.equal(state.phase,INSIGHT_PHASE.VERIFYING); assert.equal(state.narrative.source,"fallback");
	state=tracker.toolEnded({name:"bash",isError:true});
	assert.equal(state.phase,INSIGHT_PHASE.PROBLEM); assert.equal(state.problemsSeen,1); assert.match(state.facts.at(-1)?.text??"",/error/i);
});

test("model prompt is bounded to observable facts and explicitly forbids hidden reasoning",()=>{
	const tracker=new InsightTracker();tracker.beginTurn();tracker.toolStarted({name:"write",args:{path:"src/a.ts"}});
	const prompt=insightPrompt(tracker.context);
	assert.match(prompt,/observable facts/i); assert.match(prompt,/Never reveal or infer chain-of-thought/i); assert.match(prompt,/same natural language/i); assert.match(prompt,/src\/a\.ts/);
	assert.doesNotMatch(prompt,/systemPrompt/);
});

test("strict narrative parser accepts valid JSON and rejects prose or incomplete claims",()=>{
	const parsed=parseInsightNarrative('{"title":"Revisando el cambio","explanation":"Está comprobando el resultado.","why":"Así puede detectar problemas antes de terminar.","language":"es"}');
	assert.equal(parsed?.source,"model"); assert.equal(parsed?.language,"es");
	assert.equal(parseInsightNarrative("Todo va bien"),undefined);
	assert.equal(parseInsightNarrative('{"title":"x","explanation":"y","language":"es"}'),undefined);
});

test("stale model explanations cannot overwrite newer observed activity",()=>{
	const tracker=new InsightTracker();tracker.beginTurn();const revision=tracker.snapshot.revision;
	tracker.toolStarted({name:"edit",args:{path:"a.ts"}});
	tracker.applyNarrative({title:"old",explanation:"old",why:"old",language:"en",source:"model"},revision);
	assert.notEqual(tracker.snapshot.narrative.title,"old");
});

test("extension renders outside chat and can be hidden",async()=>{
	const handlers=new Map<string,Array<(event:any,ctx:any)=>unknown>>();const commands=new Map<string,any>();const widgets=new Map<string,any>();
	const pi:any={on:(name:string,handler:any)=>handlers.set(name,[...(handlers.get(name)??[]),handler]),registerCommand:(name:string,registration:any)=>commands.set(name,registration)};
	gentleInsight(pi);
	const ctx:any={hasUI:true,model:undefined,modelRegistry:undefined,sessionManager:{getSessionId:()=>"s1"},ui:{setWidget:(key:string,value:any)=>value===undefined?widgets.delete(key):widgets.set(key,value),notify(){}}};
	const fire=async(name:string,event:any={})=>{for(const handler of handlers.get(name)??[])await handler(event,ctx);};
	await fire("session_start");await fire("before_agent_start");await fire("tool_execution_start",{toolName:"bash",args:{command:"pnpm test"}});
	const component=widgets.get(INSIGHT_WIDGET_KEY)({}, {fg:(_role:string,value:string)=>value});const rendered=component.render(90).join("\n");
	assert.match(rendered,/Gentle Insight/);assert.match(rendered,/FACTS/);assert.match(rendered,/Safe fallback/);
	await commands.get(INSIGHT_COMMAND_NAME).handler("",ctx);assert.equal(widgets.has(INSIGHT_WIDGET_KEY),false);
});

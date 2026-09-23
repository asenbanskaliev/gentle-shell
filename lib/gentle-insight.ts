export const INSIGHT_PHASE = {
	IDLE: "idle", UNDERSTANDING: "understanding", INVESTIGATING: "investigating", CHANGING: "changing",
	VERIFYING: "verifying", REVIEWING: "reviewing", PROBLEM: "problem", DONE: "done",
} as const;
export type InsightPhase = (typeof INSIGHT_PHASE)[keyof typeof INSIGHT_PHASE];

export interface InsightFact {
	kind: "tool" | "change" | "check" | "problem" | "delegation";
	text: string;
}
export interface InsightNarrative {
	title: string;
	explanation: string;
	why: string;
	language: string;
	source: "model" | "fallback";
}
export interface InsightSnapshot {
	phase: InsightPhase;
	narrative: InsightNarrative;
	filesChanged: number;
	problemsSeen: number;
	problemsResolved: number;
	facts: readonly InsightFact[];
	revision: number;
}
export interface InsightContext {
	phase: InsightPhase;
	facts: readonly InsightFact[];
	filesChanged: number;
	problemsSeen: number;
	problemsResolved: number;
	revision: number;
}
interface ToolEvent { name: string; args?: Record<string, unknown>; }

const TEST_COMMAND = /(^|\s)(test|vitest|jest|pytest|go test|cargo test|pnpm test|npm test|yarn test)(\s|$)/i;
const BUILD_COMMAND = /(^|\s)(build|typecheck|tsc|check|lint)(\s|$)/i;
const REVIEW_COMMAND = /git\s+(diff|status|show)|(^|\s)diff(\s|$)/i;

function commandOf(args?: Record<string, unknown>) { return typeof args?.command === "string" ? args.command : ""; }
function pathOf(args?: Record<string, unknown>) { return typeof args?.path === "string" && args.path.length > 0 ? args.path : undefined; }
function fallback(phase: InsightPhase): InsightNarrative {
	const byPhase: Record<InsightPhase, [string,string,string]> = {
		idle:["Waiting for work","Gentle Insight will explain meaningful activity here.","It only describes observable activity and never exposes private reasoning."],
		understanding:["Understanding the task","The agent is gathering the project context it needs before changing anything.","Looking at related code first reduces the chance of making an isolated change with unintended effects."],
		investigating:["Investigating the next part","The agent is using project tools to gather more evidence before continuing.","There is not enough verified context yet for a more specific explanation."],
		changing:["Applying changes","The work has moved from investigation to modifying the project.","A code change is not treated as finished until its result has been checked."],
		verifying:["Checking the result","Automated checks are running to look for errors or behavior that stopped working after the change.","Checks provide evidence about the result instead of relying only on how the code looks."],
		reviewing:["Reviewing the final changes","The current project state is being compared with the previous one.","This helps spot accidental or unrelated changes before finishing."],
		problem:["A problem was detected","One observed action did not finish successfully. The task may continue while the cause is investigated.","Finding a failure during the work is useful evidence; it should not be presented as verified until a later check succeeds."],
		done:["Work finished","The current agent run has ended. The facts below show what Gentle Insight actually observed.","The explanation is kept separate from verified facts so a readable summary never becomes a false guarantee."],
	};
	const [title,explanation,why]=byPhase[phase];
	return {title,explanation,why,language:"en",source:"fallback"};
}
function factFor(event: ToolEvent): {phase:InsightPhase; fact:InsightFact} {
	const name=event.name.toLowerCase();
	if(["read","grep","find"].includes(name)) return {phase:INSIGHT_PHASE.UNDERSTANDING,fact:{kind:"tool",text:"Inspected project code or searched for related locations."}};
	if(["edit","write"].includes(name)) return {phase:INSIGHT_PHASE.CHANGING,fact:{kind:"change",text:pathOf(event.args)?`Changed file: ${pathOf(event.args)}`:"Changed a project file."}};
	if(name.startsWith("subagent_")) return {phase:INSIGHT_PHASE.INVESTIGATING,fact:{kind:"delegation",text:"Delegated part of the work to a subagent."}};
	if(name==="bash"){
		const command=commandOf(event.args);
		if(TEST_COMMAND.test(command)||BUILD_COMMAND.test(command)) return {phase:INSIGHT_PHASE.VERIFYING,fact:{kind:"check",text:"Started an automated verification command."}};
		if(REVIEW_COMMAND.test(command)) return {phase:INSIGHT_PHASE.REVIEWING,fact:{kind:"check",text:"Started reviewing the current changes."}};
	}
	return {phase:INSIGHT_PHASE.INVESTIGATING,fact:{kind:"tool",text:`Used tool: ${event.name}.`}};
}

export class InsightTracker {
	private snapshotValue: InsightSnapshot={phase:INSIGHT_PHASE.IDLE,narrative:fallback(INSIGHT_PHASE.IDLE),filesChanged:0,problemsSeen:0,problemsResolved:0,facts:[],revision:0};
	private readonly changedFiles=new Set<string>();
	private activeProblem=false;
	get snapshot(){return this.snapshotValue;}
	get context():InsightContext { const {phase,facts,filesChanged,problemsSeen,problemsResolved,revision}=this.snapshotValue; return {phase,facts,filesChanged,problemsSeen,problemsResolved,revision}; }
	private setPhase(phase:InsightPhase,fact?:InsightFact){
		const facts=fact?[...this.snapshotValue.facts,fact].slice(-12):this.snapshotValue.facts;
		this.snapshotValue={...this.snapshotValue,phase,narrative:fallback(phase),facts,filesChanged:this.changedFiles.size,revision:this.snapshotValue.revision+1};
		return this.snapshotValue;
	}
	beginTurn(){
		this.changedFiles.clear(); this.activeProblem=false;
		this.snapshotValue={phase:INSIGHT_PHASE.UNDERSTANDING,narrative:fallback(INSIGHT_PHASE.UNDERSTANDING),filesChanged:0,problemsSeen:0,problemsResolved:0,facts:[],revision:this.snapshotValue.revision+1};
		return this.snapshotValue;
	}
	toolStarted(event:ToolEvent){
		const next=factFor(event); const path=["edit","write"].includes(event.name.toLowerCase())?pathOf(event.args):undefined;
		if(path)this.changedFiles.add(path);
		return this.setPhase(next.phase,next.fact);
	}
	toolEnded(event:ToolEvent&{isError?:boolean}){
		if(event.isError){this.activeProblem=true; this.snapshotValue={...this.snapshotValue,problemsSeen:this.snapshotValue.problemsSeen+1}; return this.setPhase(INSIGHT_PHASE.PROBLEM,{kind:"problem",text:`Tool ${event.name} ended with an error.`});}
		if(this.activeProblem&&["bash","edit","write"].includes(event.name.toLowerCase())){this.activeProblem=false; this.snapshotValue={...this.snapshotValue,problemsResolved:this.snapshotValue.problemsResolved+1};}
		return this.snapshotValue;
	}
	applyNarrative(narrative:InsightNarrative,revision:number){if(revision!==this.snapshotValue.revision)return this.snapshotValue; this.snapshotValue={...this.snapshotValue,narrative}; return this.snapshotValue;}
	finish(){return this.setPhase(this.activeProblem?INSIGHT_PHASE.PROBLEM:INSIGHT_PHASE.DONE);}
}

export function insightPrompt(context:InsightContext): string {
	return `You are Gentle Insight, a tiny explanatory layer for a coding-agent TUI.
Explain ONLY the observable facts below. Never reveal or infer chain-of-thought, hidden reasoning, motives, or unobserved actions.
Write in the same natural language the user is using in the current session when that language is available from normal conversation context; otherwise use English.
Audience: a person who wants to understand software work without unnecessary jargon. Be informative and mildly educational, not childish.
Return strict JSON only: {"title":"...","explanation":"...","why":"...","language":"BCP-47 code"}.
title: <= 8 words. explanation: <= 55 words. why: <= 45 words.
Do not claim all tests passed unless the facts explicitly prove it. Do not invent counts, files, causes, intentions, or outcomes.
Phase: ${context.phase}
Observed facts:
${context.facts.length?context.facts.map(f=>`- [${f.kind}] ${f.text}`).join("\n"):"- No detailed tool facts observed yet."}
Counters: files_changed=${context.filesChanged}; problems_seen=${context.problemsSeen}; problems_resolved=${context.problemsResolved}`;
}

export function parseInsightNarrative(raw:string):InsightNarrative|undefined {
	try {
		const value=JSON.parse(raw.trim()) as Record<string,unknown>;
		if(typeof value.title!=="string"||typeof value.explanation!=="string"||typeof value.why!=="string"||typeof value.language!=="string")return undefined;
		if(!value.title.trim()||!value.explanation.trim()||!value.why.trim()||value.title.length>120||value.explanation.length>800||value.why.length>600)return undefined;
		return {title:value.title.trim(),explanation:value.explanation.trim(),why:value.why.trim(),language:value.language.trim().slice(0,32)||"und",source:"model"};
	} catch { return undefined; }
}

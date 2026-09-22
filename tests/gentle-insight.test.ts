import assert from "node:assert/strict";
import test from "node:test";
import { InsightTracker, INSIGHT_PHASE } from "../lib/gentle-insight.ts";
import gentleInsight, { INSIGHT_COMMAND_NAME, INSIGHT_WIDGET_KEY } from "../extensions/gentle-insight.ts";

test("InsightTracker turns technical activity into contextual plain-language phases", () => {
	const tracker = new InsightTracker();
	assert.equal(tracker.beginTurn().phase, INSIGHT_PHASE.UNDERSTANDING);

	let state = tracker.toolStarted({ name: "grep", args: { pattern: "registerTool" } });
	assert.equal(state.phase, INSIGHT_PHASE.UNDERSTANDING);
	assert.match(state.explanation, /revisando el código/i);

	state = tracker.toolStarted({ name: "edit", args: { path: "extensions/example.ts" } });
	assert.equal(state.phase, INSIGHT_PHASE.CHANGING);
	assert.equal(state.filesChanged, 1);
	assert.match(state.why, /comprobar/i);

	state = tracker.toolStarted({ name: "bash", args: { command: "pnpm test" } });
	assert.equal(state.phase, INSIGHT_PHASE.VERIFYING);
	assert.match(state.explanation, /comprobaciones automáticas/i);

	state = tracker.toolEnded({ name: "bash", isError: true });
	assert.equal(state.phase, INSIGHT_PHASE.PROBLEM);
	assert.equal(state.problemsSeen, 1);
	assert.match(state.explanation, /no ha terminado como se esperaba/i);

	tracker.toolStarted({ name: "edit", args: { path: "extensions/example.ts" } });
	state = tracker.toolEnded({ name: "edit", isError: false });
	assert.equal(state.problemsResolved, 1);

	state = tracker.finish();
	assert.equal(state.phase, INSIGHT_PHASE.DONE);
	assert.equal(state.filesChanged, 1);
});

test("unknown tools stay honest instead of inventing intent", () => {
	const tracker = new InsightTracker();
	tracker.beginTurn();
	const state = tracker.toolStarted({ name: "future_tool", args: {} });
	assert.equal(state.phase, INSIGHT_PHASE.INVESTIGATING);
	assert.match(state.why, /no tiene suficiente información/i);
});

test("extension renders outside chat and can be hidden without changing agent prompts", async () => {
	const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
	const commands = new Map<string, any>();
	const widgets = new Map<string, any>();
	const notices: string[] = [];
	const pi: any = {
		on(name: string, handler: (event: any, ctx: any) => unknown) {
			handlers.set(name, [...(handlers.get(name) ?? []), handler]);
		},
		registerCommand(name: string, registration: any) { commands.set(name, registration); },
	};
	gentleInsight(pi);
	const ctx: any = {
		hasUI: true,
		sessionManager: { getSessionId: () => "s1" },
		ui: {
			setWidget(key: string, value: any) {
				if (value === undefined) widgets.delete(key);
				else widgets.set(key, value);
			},
			notify(message: string) { notices.push(message); },
		},
	};
	const fire = async (name: string, event: any = {}) => {
		for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
	};

	await fire("session_start");
	assert.ok(widgets.has(INSIGHT_WIDGET_KEY));
	await fire("before_agent_start", { systemPrompt: "unchanged" });
	await fire("tool_execution_start", { toolName: "bash", args: { command: "pnpm test" } });

	const factory = widgets.get(INSIGHT_WIDGET_KEY);
	const component = factory({}, { fg: (_role: string, value: string) => value });
	const rendered = component.render(90).join("\n");
	assert.match(rendered, /Gentle Insight/);
	assert.match(rendered, /Comprobando que el cambio funciona/);
	assert.match(rendered, /POR QUÉ/);

	await commands.get(INSIGHT_COMMAND_NAME).handler("", ctx);
	assert.equal(widgets.has(INSIGHT_WIDGET_KEY), false);
	assert.match(notices.at(-1) ?? "", /oculto/);
});

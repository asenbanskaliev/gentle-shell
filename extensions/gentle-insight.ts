import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CARD_TONE, renderCard } from "../lib/shell-card.ts";
import { InsightTracker, INSIGHT_PHASE, type InsightSnapshot } from "../lib/gentle-insight.ts";

export const INSIGHT_WIDGET_KEY = "gentle-insight";
export const INSIGHT_COMMAND_NAME = "gentle:insight";

interface InsightSession {
	tracker: InsightTracker;
	enabled: boolean;
}

function sessionKey(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionId();
}

function summary(snapshot: InsightSnapshot): string {
	const parts: string[] = [];
	if (snapshot.filesChanged > 0) parts.push(`${snapshot.filesChanged} ${snapshot.filesChanged === 1 ? "archivo modificado" : "archivos modificados"}`);
	if (snapshot.problemsSeen > 0) parts.push(`${snapshot.problemsSeen} ${snapshot.problemsSeen === 1 ? "problema detectado" : "problemas detectados"}`);
	if (snapshot.problemsResolved > 0) parts.push(`${snapshot.problemsResolved} ${snapshot.problemsResolved === 1 ? "resuelto" : "resueltos"}`);
	return parts.join(" · ");
}

function tone(snapshot: InsightSnapshot) {
	if (snapshot.phase === INSIGHT_PHASE.PROBLEM) return CARD_TONE.WARNING;
	if (snapshot.phase === INSIGHT_PHASE.DONE) return CARD_TONE.SUCCESS;
	return CARD_TONE.INFO;
}

export function insightCard(snapshot: InsightSnapshot) {
	const body = [
		`AHORA · ${snapshot.title}`,
		"",
		snapshot.explanation,
		"",
		`POR QUÉ · ${snapshot.why}`,
	];
	const stats = summary(snapshot);
	if (stats) body.push("", stats);
	return {
		title: "Gentle Insight",
		subtitle: "qué ocurre y por qué",
		body,
		tone: tone(snapshot),
		glyph: "✦",
	};
}

export default function gentleInsight(pi: ExtensionAPI) {
	const sessions = new Map<string, InsightSession>();

	const state = (ctx: ExtensionContext): InsightSession => {
		const key = sessionKey(ctx);
		let current = sessions.get(key);
		if (!current) {
			current = { tracker: new InsightTracker(), enabled: true };
			sessions.set(key, current);
		}
		return current;
	};

	const show = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		const current = state(ctx);
		if (!current.enabled) {
			ctx.ui.setWidget(INSIGHT_WIDGET_KEY, undefined);
			return;
		}
		const card = insightCard(current.tracker.snapshot);
		ctx.ui.setWidget(INSIGHT_WIDGET_KEY, (_tui, theme) => ({
			render(width: number) { return renderCard(card, theme, width, { expanded: true }); },
			invalidate() {},
			dispose() {},
		}));
	};

	pi.registerCommand(INSIGHT_COMMAND_NAME, {
		description: "Show or hide the plain-language explanation of what Gentle is doing and why.",
		handler: async (_args, ctx) => {
			const current = state(ctx);
			current.enabled = !current.enabled;
			show(ctx);
			if (ctx.hasUI) ctx.ui.notify(`Gentle Insight ${current.enabled ? "activado" : "oculto"}.`, "info");
		},
	});

	pi.on("session_start", (_event, ctx) => show(ctx));
	pi.on("before_agent_start", (_event, ctx) => {
		state(ctx).tracker.beginTurn();
		show(ctx);
	});
	pi.on("tool_execution_start", (event, ctx) => {
		state(ctx).tracker.toolStarted({
			name: event.toolName,
			args: event.args as Record<string, unknown> | undefined,
		});
		show(ctx);
	});
	pi.on("tool_execution_end", (event, ctx) => {
		state(ctx).tracker.toolEnded({
			name: event.toolName,
			isError: event.isError,
		});
		show(ctx);
	});
	pi.on("agent_end", (_event, ctx) => {
		state(ctx).tracker.finish();
		show(ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		sessions.delete(sessionKey(ctx));
	});
}

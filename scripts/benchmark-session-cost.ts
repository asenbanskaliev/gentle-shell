import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildShellBarModel } from "../extensions/gentle-shell.ts";

const pi = { getThinkingLevel: () => "medium" };
const footerData = {
	getGitBranch: () => "main",
	getExtensionStatuses: () => new Map(),
	getAvailableProviderCount: () => 1,
	onBranchChange: () => () => {},
};

function makeEntries(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		type: "message",
		message: { role: "assistant", usage: { cost: { total: (index % 17) / 100_000 } } },
	}));
}

function makeContext(entries: ReturnType<typeof makeEntries>, onRead: () => void) {
	return {
		model: { id: "benchmark-model", provider: "benchmark", reasoning: true, contextWindow: 272_000 },
		sessionManager: {
			getCwd: () => "/repo",
			getSessionName: () => "benchmark",
			getEntries: () => { onRead(); return entries; },
		},
		modelRegistry: { isUsingOAuth: () => false },
		getContextUsage: () => ({ tokens: 100_000, contextWindow: 272_000, percent: 37 }),
	};
}

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)]!;
}

function runCase(entryCount: number, renders: number) {
	const entries = makeEntries(entryCount);
	const cachedTotal = entries.reduce((sum, entry) => sum + entry.message.usage.cost.total, 0);
	let reads = 0;
	const ctx = makeContext(entries, () => { reads += 1; });

	for (let index = 0; index < 50; index += 1) {
		buildShellBarModel(pi as never, ctx as never, footerData, { home: "/home/bench" });
		buildShellBarModel(pi as never, ctx as never, footerData, { home: "/home/bench", costTotal: cachedTotal });
	}

	const baselineMs: number[] = [];
	const cachedMs: number[] = [];
	for (let round = 0; round < 3; round += 1) {
		reads = 0;
		let baselineCost = 0;
		let started = performance.now();
		for (let index = 0; index < renders; index += 1) {
			baselineCost = buildShellBarModel(pi as never, ctx as never, footerData, { home: "/home/bench" }).costTotal;
		}
		baselineMs.push(performance.now() - started);
		assert.equal(reads, renders);
		assert.ok(Math.abs(baselineCost - cachedTotal) < 1e-9);

		reads = 0;
		let optimizedCost = 0;
		started = performance.now();
		for (let index = 0; index < renders; index += 1) {
			optimizedCost = buildShellBarModel(pi as never, ctx as never, footerData, { home: "/home/bench", costTotal: cachedTotal }).costTotal;
		}
		cachedMs.push(performance.now() - started);
		assert.equal(reads, 0);
		assert.ok(Math.abs(optimizedCost - cachedTotal) < 1e-9);
	}

	const before = median(baselineMs);
	const after = median(cachedMs);
	return {
		entries: entryCount,
		renders,
		beforeMs: before,
		afterMs: after,
		speedup: before / Math.max(after, 0.000001),
		beforeHistoryReads: renders,
		afterHistoryReads: 0,
		entriesVisitedBefore: entryCount * renders,
		entriesVisitedAfterPerRender: 0,
	};
}

// A/B is intentionally measured in one process so both paths share the same runtime and machine.
const cases = [[100, 10000], [1000, 3000], [10000, 500], [50000, 100]] as const;
const results = cases.map(([entries, renders]) => runCase(entries, renders));

console.log("| session entries | renders | before ms | after ms | speedup | history reads before | history reads after |");
console.log("|---:|---:|---:|---:|---:|---:|---:|");
for (const result of results) {
	console.log(`| ${result.entries} | ${result.renders} | ${result.beforeMs.toFixed(2)} | ${result.afterMs.toFixed(2)} | ${result.speedup.toFixed(1)}x | ${result.beforeHistoryReads} | ${result.afterHistoryReads} |`);
}
console.log("\nMachine-readable results:");
console.log(JSON.stringify(results, null, 2));

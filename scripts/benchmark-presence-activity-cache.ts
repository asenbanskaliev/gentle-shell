import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { PresencePublisher, listPresence, readActivity, type Header } from "../lib/orchestrator-presence.ts";

function activityWithBytes(targetBytes: number, suffix = "") {
	const fixed = 700;
	const text = "x".repeat(Math.max(0, targetBytes - fixed)) + suffix;
	return [{
		task: {
			id: "task",
			agent: "worker",
			label: "benchmark",
			status: "running",
			model: "benchmark-model",
			createdAt: 1,
			startedAt: 1,
			endedAt: null,
			lastActivityAt: 1,
		},
		thread: {
			version: 1,
			dropped: 0,
			items: [{ kind: "text", text }],
		},
	}];
}

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)]!;
}

function version(header: Header) {
	return `${header.generation}:${header.digest ?? ""}:${header.unavailable ?? ""}`;
}

async function runCase(sizeBytes: number, sessionCount: number, polls: number) {
	const profile = mkdtempSync(join(tmpdir(), "gentle-presence-bench-"));
	const publishers = Array.from({ length: sessionCount }, (_, index) =>
		PresencePublisher.start({
			profile,
			sessionId: `session-${index}`,
			label: `Session ${index}`,
			activity: activityWithBytes(sizeBytes),
		}),
	);
	try {
		const headers = () => listPresence(profile).entries;
		assert.equal(headers().length, sessionCount);

		const beforeSamples: number[] = [];
		const afterSamples: number[] = [];
		for (let round = 0; round < 5; round += 1) {
			let touched = 0;
			let started = performance.now();
			for (let poll = 0; poll < polls; poll += 1) {
				for (const header of headers()) touched += readActivity(profile, header).activity?.tasks.length ?? 0;
			}
			beforeSamples.push(performance.now() - started);
			assert.ok(touched > 0);

			const cache = new Map<string, { version: string; count: number }>();
			touched = 0;
			started = performance.now();
			for (let poll = 0; poll < polls; poll += 1) {
				for (const header of headers()) {
					const key = `${header.sessionHash}:${header.incarnation}`;
					const currentVersion = version(header);
					const cached = cache.get(key);
					if (cached?.version === currentVersion) {
						touched += cached.count;
						continue;
					}
					const result = readActivity(profile, header);
					const count = result.activity?.tasks.length ?? 0;
					if (result.activity || header.unavailable) cache.set(key, { version: currentVersion, count });
					touched += count;
				}
			}
			afterSamples.push(performance.now() - started);
			assert.ok(touched > 0);
		}

		const beforeMs = median(beforeSamples);
		const afterMs = median(afterSamples);

		// Correctness: a real activity update changes generation/digest and must be re-read.
		const firstHeader = headers().find((entry) => entry.label === "Session 0")!;
		const firstVersion = version(firstHeader);
		publishers[0]!.update(activityWithBytes(sizeBytes, "-updated"));
		await new Promise((resolve) => setTimeout(resolve, 450));
		const updatedHeader = headers().find((entry) => entry.label === "Session 0")!;
		assert.notEqual(version(updatedHeader), firstVersion, "an activity update must invalidate the cache key");
		const updated = readActivity(profile, updatedHeader);
		assert.match((updated.activity?.tasks[0]?.thread.items[0] as { text?: string } | undefined)?.text ?? "", /-updated$/);

		return {
			sizeBytes,
			sessionCount,
			polls,
			beforeMs,
			afterMs,
			speedup: beforeMs / afterMs,
			beforeMsPerPoll: beforeMs / polls,
			afterMsPerPoll: afterMs / polls,
			savedMsPerPoll: (beforeMs - afterMs) / polls,
		};
	} finally {
		for (const publisher of publishers) publisher.dispose();
		rmSync(profile, { recursive: true, force: true });
	}
}

const cases = [
	[100 * 1024, 1, 100],
	[100 * 1024, 5, 100],
	[1024 * 1024, 1, 30],
	[1024 * 1024, 5, 30],
	[5 * 1024 * 1024, 1, 10],
	[5 * 1024 * 1024, 5, 10],
] as const;

for (const [sizeBytes, sessionCount, polls] of cases) {
	const result = await runCase(sizeBytes, sessionCount, polls);
	console.log(JSON.stringify(result));
}

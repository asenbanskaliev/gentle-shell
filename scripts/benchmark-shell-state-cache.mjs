import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const root = mkdtempSync(join(tmpdir(), "gentle-shell-state-bench-"));
const profilesPath = join(root, "profiles.json");
writeFileSync(profilesPath, JSON.stringify({
  kind: "gentle-pi.agent_model_profiles",
  version: 1,
  active: "performance",
  profiles: { performance: { orchestrator: { model: "gpt-5.6" } } },
}));

let fingerprint;
let profileName;
let statCalls = 0;
let fileReads = 0;

function activeProfile() {
  statCalls += 1;
  const stat = statSync(profilesPath, { bigint: true });
  const next = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  if (next !== fingerprint) {
    fileReads += 1;
    profileName = JSON.parse(readFileSync(profilesPath, "utf8")).active;
    fingerprint = next;
  }
  return profileName;
}

function buildShellModel() {
  return {
    cwd: "/repo",
    profile: activeProfile(),
    branch: "main",
    dirty: 3,
    sessionName: "benchmark",
    modelId: "gpt-5.6",
    effort: "high",
    contextPercent: 45,
    contextWindow: 272000,
    costTotal: 2.345,
    subscription: true,
    usage: { provider: "openai", limits: [{ name: "week", usedPercent: 40 }] },
    statuses: ["MCP: 3 servers enabled"],
    changes: { files: 3, added: 12, deleted: 4 },
  };
}

function headerModel(model) {
  return {
    modelId: model.modelId,
    effort: model.effort,
    contextPercent: model.contextPercent,
    costTotal: model.costTotal,
    usage: model.usage,
    sessionName: model.sessionName,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(frames, coalesced) {
  const samples = [];
  let last;
  for (let sample = 0; sample < 7; sample += 1) {
    activeProfile();
    statCalls = 0;
    fileReads = 0;
    let sink = 0;
    const started = performance.now();
    for (let frame = 0; frame < frames; frame += 1) {
      if (coalesced) {
        const model = buildShellModel();
        const header = headerModel(model);
        sink += JSON.stringify(model).length;
        sink += JSON.stringify(model).length;
        sink += JSON.stringify(header).length;
        sink += JSON.stringify(header).length;
      } else {
        sink += JSON.stringify(buildShellModel()).length;
        sink += JSON.stringify(buildShellModel()).length;
        sink += JSON.stringify(headerModel(buildShellModel())).length;
        sink += JSON.stringify(headerModel(buildShellModel())).length;
      }
    }
    last = { ms: performance.now() - started, statCalls, fileReads, sink };
    samples.push(last.ms);
  }
  return { ...last, ms: median(samples) };
}

for (const frames of [1000, 5000, 10000]) {
  const before = measure(frames, false);
  const after = measure(frames, true);
  console.log(JSON.stringify({
    frames,
    before,
    after,
    hotPathSpeedup: before.ms / after.ms,
    savedMsPerFrame: (before.ms - after.ms) / frames,
    statCallsPerFrameBefore: before.statCalls / frames,
    statCallsPerFrameAfter: after.statCalls / frames,
  }));
}

rmSync(root, { recursive: true, force: true });

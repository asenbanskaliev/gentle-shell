import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { gentlePiConfigHome } from "./agent-home.ts";

export const LANGUAGE_SCHEMA = "gentle-pi.language/v1";
export const LANGUAGE = { AUTO: "auto", EN: "en", ES: "es" } as const;
export type LanguagePolicy = (typeof LANGUAGE)[keyof typeof LANGUAGE];
export type ResolvedLanguage = Exclude<LanguagePolicy, "auto">;

interface LanguageOptions {
	gentlePiConfigHome?: string;
	env?: NodeJS.ProcessEnv;
	locale?: string;
}

export interface LanguageResolution {
	policy: LanguagePolicy;
	language: ResolvedLanguage;
	source: "global_file" | "environment" | "default";
	malformed: boolean;
	globalFile: string;
}

export function parseLanguagePolicyFile(raw: string): LanguagePolicy | undefined {
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
		if (!("schema" in value) || value.schema !== LANGUAGE_SCHEMA || !("language" in value) || Object.keys(value).length !== 2) return undefined;
		return value.language === "auto" || value.language === "en" || value.language === "es" ? value.language : undefined;
	} catch { return undefined; }
}

export function languageFromLocale(locale: string | undefined): ResolvedLanguage | undefined {
	if (!locale) return undefined;
	const primary = locale.trim().toLowerCase().replace("_", "-").split("-")[0];
	return primary === "es" ? "es" : primary === "en" ? "en" : undefined;
}

function environmentLocale(env: NodeJS.ProcessEnv): string | undefined {
	return env.LC_ALL || env.LC_MESSAGES || env.LANG;
}

export function resolveLanguagePolicy(options: LanguageOptions = {}): LanguageResolution {
	const globalFile = join(options.gentlePiConfigHome ?? gentlePiConfigHome(), "language.json");
	const env = options.env ?? process.env;
	let policy: LanguagePolicy = "auto";
	let malformed = false;
	let hasFile = false;
	try {
		hasFile = true;
		const parsed = parseLanguagePolicyFile(readFileSync(globalFile, "utf8"));
		if (parsed) policy = parsed;
		else malformed = true;
	} catch (error) {
		const missing = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
		if (!missing) { hasFile = true; malformed = true; }
	}
	if (policy !== "auto") return { policy, language: policy, source: "global_file", malformed, globalFile };
	const detected = languageFromLocale(options.locale ?? environmentLocale(env));
	return { policy, language: detected ?? "en", source: detected ? "environment" : "default", malformed, globalFile };
}

export function writeLanguagePolicy(policy: LanguagePolicy, options: LanguageOptions = {}): string {
	const home = options.gentlePiConfigHome ?? gentlePiConfigHome();
	const path = join(home, "language.json");
	const temporary = `${path}.${randomUUID()}.tmp`;
	mkdirSync(home, { recursive: true });
	try {
		writeFileSync(temporary, `${JSON.stringify({ schema: LANGUAGE_SCHEMA, language: policy })}\n`, { flag: "wx", mode: 0o600 });
		renameSync(temporary, path);
	} finally {
		try { unlinkSync(temporary); } catch { /* Rename consumed the temporary file. */ }
	}
	return path;
}

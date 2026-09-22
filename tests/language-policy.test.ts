import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EN_MESSAGES, ES_MESSAGES, languageLabel, translate } from "../lib/i18n.ts";
import { LANGUAGE_SCHEMA, languageFromLocale, parseLanguagePolicyFile, resolveLanguagePolicy, writeLanguagePolicy } from "../lib/language-policy.ts";

test("language policy parses only the versioned closed schema", () => {
	assert.equal(parseLanguagePolicyFile(JSON.stringify({ schema: LANGUAGE_SCHEMA, language: "es" })), "es");
	assert.equal(parseLanguagePolicyFile(JSON.stringify({ schema: LANGUAGE_SCHEMA, language: "fr" })), undefined);
	assert.equal(parseLanguagePolicyFile(JSON.stringify({ schema: LANGUAGE_SCHEMA, language: "es", extra: true })), undefined);
	assert.equal(parseLanguagePolicyFile("{"), undefined);
});

test("locale detection supports English and Spanish variants and rejects unsupported locales", () => {
	assert.equal(languageFromLocale("es_ES.UTF-8"), "es");
	assert.equal(languageFromLocale("es-MX"), "es");
	assert.equal(languageFromLocale("en_US.UTF-8"), "en");
	assert.equal(languageFromLocale("fr-FR"), undefined);
});

test("auto follows environment and unsupported locales fall back to English", () => {
	const home = mkdtempSync(join(tmpdir(), "gp-language-"));
	try {
		assert.deepEqual(resolveLanguagePolicy({ gentlePiConfigHome: home, env: { LANG: "es_ES.UTF-8" } }).language, "es");
		assert.deepEqual(resolveLanguagePolicy({ gentlePiConfigHome: home, env: { LANG: "fr_FR.UTF-8" } }).language, "en");
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test("explicit policy wins over environment and persists atomically", () => {
	const home = mkdtempSync(join(tmpdir(), "gp-language-"));
	try {
		const path = writeLanguagePolicy("es", { gentlePiConfigHome: home });
		assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { schema: LANGUAGE_SCHEMA, language: "es" });
		const result = resolveLanguagePolicy({ gentlePiConfigHome: home, env: { LANG: "en_US" } });
		assert.equal(result.policy, "es");
		assert.equal(result.language, "es");
		assert.equal(result.source, "global_file");
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test("malformed persisted policy is attributed and safely falls back", () => {
	const home = mkdtempSync(join(tmpdir(), "gp-language-"));
	try {
		writeFileSync(join(home, "language.json"), "{bad");
		const result = resolveLanguagePolicy({ gentlePiConfigHome: home, env: { LANG: "es_ES" } });
		assert.equal(result.malformed, true);
		assert.equal(result.language, "es");
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test("English and Spanish catalogs have exact key and placeholder parity", () => {
	assert.deepEqual(Object.keys(ES_MESSAGES).sort(), Object.keys(EN_MESSAGES).sort());
	for (const key of Object.keys(EN_MESSAGES) as Array<keyof typeof EN_MESSAGES>) {
		const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
		assert.deepEqual(placeholders(ES_MESSAGES[key]), placeholders(EN_MESSAGES[key]), key);
	}
});

test("translation is deterministic and interpolates values", () => {
	assert.equal(translate("es", "language.changed", { language: "Español" }), "Idioma cambiado a Español.");
	assert.equal(translate("en", "language.changed", { language: "Spanish" }), "Language changed to Spanish.");
	assert.equal(languageLabel("auto", "es"), "Automático");
});

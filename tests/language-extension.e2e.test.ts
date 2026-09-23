import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import gentleLanguage from "../extensions/gentle-language.ts";
import { LANGUAGE_SCHEMA } from "../lib/language-policy.ts";

type RegisteredCommand = {
	description?: string;
	handler: (args: string, ctx: any) => Promise<void>;
};

function registerLanguageCommand(): RegisteredCommand {
	let registered: RegisteredCommand | undefined;
	gentleLanguage({
		registerCommand(name: string, command: RegisteredCommand) {
			assert.equal(name, "gentle:language");
			registered = command;
		},
	} as any);
	assert.ok(registered);
	return registered;
}

function uiContext(select?: (title: string, options: string[]) => Promise<string | undefined>) {
	const notifications: Array<{ message: string; type?: string }> = [];
	return {
		notifications,
		ctx: {
			hasUI: true,
			ui: {
				notify(message: string, type?: string) { notifications.push({ message, type }); },
				...(select ? { select } : {}),
			},
		},
	};
}

test("E2E language command persists Spanish and immediately confirms in Spanish", async () => {
	const home = mkdtempSync(join(tmpdir(), "gp-language-e2e-"));
	const previous = process.env.GENTLE_PI_CONFIG_HOME;
	process.env.GENTLE_PI_CONFIG_HOME = home;
	try {
		const command = registerLanguageCommand();
		const { ctx, notifications } = uiContext();
		await command.handler("es", ctx);
		assert.deepEqual(JSON.parse(readFileSync(join(home, "language.json"), "utf8")), { schema: LANGUAGE_SCHEMA, language: "es" });
		assert.deepEqual(notifications, [{ message: "Idioma cambiado a Español.", type: "info" }]);
	} finally {
		if (previous === undefined) delete process.env.GENTLE_PI_CONFIG_HOME;
		else process.env.GENTLE_PI_CONFIG_HOME = previous;
		rmSync(home, { recursive: true, force: true });
	}
});

test("E2E interactive selector writes the selected policy using localized options", async () => {
	const home = mkdtempSync(join(tmpdir(), "gp-language-e2e-"));
	const previousHome = process.env.GENTLE_PI_CONFIG_HOME;
	const previousLang = process.env.LANG;
	process.env.GENTLE_PI_CONFIG_HOME = home;
	process.env.LANG = "es_ES.UTF-8";
	try {
		let seenTitle = "";
		let seenOptions: string[] = [];
		const { ctx, notifications } = uiContext(async (title, options) => {
			seenTitle = title;
			seenOptions = options;
			return "Inglés";
		});
		await registerLanguageCommand().handler("", ctx);
		assert.equal(seenTitle, "Idioma de Gentle");
		assert.deepEqual(seenOptions, ["Automático", "Inglés", "Español"]);
		assert.deepEqual(JSON.parse(readFileSync(join(home, "language.json"), "utf8")), { schema: LANGUAGE_SCHEMA, language: "en" });
		assert.deepEqual(notifications, [{ message: "Language changed to English.", type: "info" }]);
	} finally {
		if (previousHome === undefined) delete process.env.GENTLE_PI_CONFIG_HOME; else process.env.GENTLE_PI_CONFIG_HOME = previousHome;
		if (previousLang === undefined) delete process.env.LANG; else process.env.LANG = previousLang;
		rmSync(home, { recursive: true, force: true });
	}
});

test("E2E invalid language never writes config and reports a localized error", async () => {
	const home = mkdtempSync(join(tmpdir(), "gp-language-e2e-"));
	const previousHome = process.env.GENTLE_PI_CONFIG_HOME;
	const previousLang = process.env.LANG;
	process.env.GENTLE_PI_CONFIG_HOME = home;
	process.env.LANG = "es_ES.UTF-8";
	try {
		const { ctx, notifications } = uiContext();
		await registerLanguageCommand().handler("fr", ctx);
		assert.deepEqual(notifications, [{ message: "Idioma desconocido. Usa auto, en o es.", type: "error" }]);
		assert.throws(() => readFileSync(join(home, "language.json"), "utf8"));
	} finally {
		if (previousHome === undefined) delete process.env.GENTLE_PI_CONFIG_HOME; else process.env.GENTLE_PI_CONFIG_HOME = previousHome;
		if (previousLang === undefined) delete process.env.LANG; else process.env.LANG = previousLang;
		rmSync(home, { recursive: true, force: true });
	}
});

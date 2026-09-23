import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { languageLabel, translate } from "../lib/i18n.ts";
import { LANGUAGE, resolveLanguagePolicy, writeLanguagePolicy, type LanguagePolicy } from "../lib/language-policy.ts";

const OPTIONS: readonly LanguagePolicy[] = [LANGUAGE.AUTO, LANGUAGE.EN, LANGUAGE.ES];

function notify(ctx: ExtensionContext, message: string, type: "info" | "error" = "info"): void {
	if (ctx.hasUI && typeof ctx.ui.notify === "function") ctx.ui.notify(message, type);
}

export default function gentleLanguage(pi: ExtensionAPI): void {
	pi.registerCommand("gentle:language", {
		description: "Show or set Gentle Shell UI language (auto|en|es).",
		handler: async (args, ctx) => {
			let resolution = resolveLanguagePolicy();
			let action = args.trim().toLowerCase();
			if (!action && ctx.hasUI && typeof ctx.ui.select === "function") {
				const labels = OPTIONS.map((value) => languageLabel(value, resolution.language));
				const selected = await ctx.ui.select(
					translate(resolution.language, "language.title"),
					labels,
				);
				if (selected === undefined) return;
				action = OPTIONS[labels.indexOf(selected)] ?? "";
			}
			if (!action) {
				notify(ctx, translate(resolution.language, "language.current", {
					language: languageLabel(resolution.language, resolution.language),
					policy: resolution.policy,
				}));
				return;
			}
			if (!OPTIONS.includes(action as LanguagePolicy)) {
				notify(ctx, translate(resolution.language, "language.invalid"), "error");
				return;
			}
			writeLanguagePolicy(action as LanguagePolicy);
			resolution = resolveLanguagePolicy();
			notify(ctx, translate(resolution.language, "language.changed", {
				language: languageLabel(resolution.language, resolution.language),
			}));
		},
	});
}

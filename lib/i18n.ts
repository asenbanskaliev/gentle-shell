import { resolveLanguagePolicy, type ResolvedLanguage } from "./language-policy.ts";

export const EN_MESSAGES = {
	"language.title": "Gentle language",
	"language.current": "Current language: {language} ({policy})",
	"language.changed": "Language changed to {language}.",
	"language.invalid": "Unknown language. Use auto, en, or es.",
	"language.auto": "Auto",
	"language.en": "English",
	"language.es": "Spanish",
	"shell.status": "Status",
	"shell.project": "Project",
	"shell.branch": "Branch",
	"shell.session": "Session",
	"shell.profile": "Profile",
	"shell.changes": "Changes",
	"shell.integrations": "Integrations",
	"shell.noChanges": "No captured changes",
	"shell.noStatus": "No status reported",
	"shell.file.one": "file",
	"shell.file.other": "files",
	"shell.usage": "usage",
} as const;

export type MessageKey = keyof typeof EN_MESSAGES;
type Catalog = Record<MessageKey, string>;

export const ES_MESSAGES: Catalog = {
	"language.title": "Idioma de Gentle",
	"language.current": "Idioma actual: {language} ({policy})",
	"language.changed": "Idioma cambiado a {language}.",
	"language.invalid": "Idioma desconocido. Usa auto, en o es.",
	"language.auto": "Automático",
	"language.en": "Inglés",
	"language.es": "Español",
	"shell.status": "Estado",
	"shell.project": "Proyecto",
	"shell.branch": "Rama",
	"shell.session": "Sesión",
	"shell.profile": "Perfil",
	"shell.changes": "Cambios",
	"shell.integrations": "Integraciones",
	"shell.noChanges": "Sin cambios registrados",
	"shell.noStatus": "Sin estado disponible",
	"shell.file.one": "archivo",
	"shell.file.other": "archivos",
	"shell.usage": "uso",
};

const CATALOGS: Record<ResolvedLanguage, Catalog> = { en: EN_MESSAGES, es: ES_MESSAGES };

export function translate(language: ResolvedLanguage, key: MessageKey, params: Record<string, string | number> = {}): string {
	const template = CATALOGS[language]?.[key] ?? EN_MESSAGES[key];
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => name in params ? String(params[name]) : match);
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
	return translate(resolveLanguagePolicy().language, key, params);
}

export function languageLabel(language: "auto" | ResolvedLanguage, displayLanguage: ResolvedLanguage): string {
	return translate(displayLanguage, `language.${language}` as MessageKey);
}

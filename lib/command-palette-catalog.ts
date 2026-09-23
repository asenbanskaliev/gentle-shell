import type { CommandPaletteGroup, CommandPaletteItem } from "./command-palette.ts";
import { translate } from "./i18n.ts";
import { resolveLanguagePolicy, type ResolvedLanguage } from "./language-policy.ts";

// The curated command set for the command palette: an OpenCode-style
// grouped menu, not a raw listing of every registered extension command.
// Only command + label live here; the live description and any shortcut
// hint are attached at build time by buildCommandPaletteGroups, from the
// actual registration and the shell's configured shortcuts.

export interface CommandPaletteCatalogItem {
	command: string;
	label: string;
}

export interface CommandPaletteCatalogGroup {
	title: string;
	items: readonly CommandPaletteCatalogItem[];
}

export const COMMAND_PALETTE_CATALOG: readonly CommandPaletteCatalogGroup[] = [
	{
		title: "Configuration",
		items: [
			{ command: "gentle:models", label: "Assign models and effort" },
			{ command: "gentle:profiles", label: "Agent-model profiles" },
			{ command: "gentle:persona", label: "Switch persona" },
			{ command: "gentle:review-mode", label: "Review mode (receipt-driven development)" },
			{ command: "gentle:background-subagents", label: "Background subagents" },
			{ command: "gentle:double-esc-cancel", label: "Require double Esc to cancel" },
			{ command: "gentle:animations", label: "Animation mode" },
			{ command: "gentle:telemetry", label: "Telemetry" },
			{ command: "gentle:banner", label: "Startup banner" },
			{ command: "gentle:banner-color", label: "Banner color" },
			{ command: "gentle:toggle-rose", label: "Toggle banner rose" },
			{ command: "gentle:toggle-text-logo", label: "Toggle banner text logo" },
			{ command: "gentle:dev-binary", label: "Gentle AI dev binary" },
			{ command: "gentle:language", label: "UI language" },
		],
	},
	{
		title: "Session",
		items: [
			{ command: "gentle:changes", label: "Browse captured changes" },
			{ command: "gentle:agents", label: "Subagents" },
			{ command: "gentle:usage", label: "Subscription usage" },
			{ command: "gentle:review-session-permission", label: "Review session permission" },
		],
	},
	{
		title: "Diagnostics",
		items: [
			{ command: "gentle:status", label: "Gentle AI status" },
			{ command: "gentle:doctor", label: "Doctor" },
		],
	},
	{
		title: "SDD",
		items: [
			{ command: "gentle:sdd-preflight", label: "SDD preflight" },
			{ command: "gentle-sdd-status", label: "SDD status" },
			{ command: "gentle-sdd-continue", label: "SDD continue" },
			{ command: "gentle-sdd-init", label: "SDD init" },
		],
	},
	{
		title: "Skills",
		items: [{ command: "skill-registry:refresh", label: "Refresh skill registry" }],
	},
];

/**
 * Build the palette's groups for one session: keep only catalog entries
 * whose command is actually registered (so a missing extension never shows
 * a dead row), attach that registration's live description and an optional
 * shortcut hint, and drop any group left with no items. Catalog order is
 * preserved throughout.
 */
export function buildCommandPaletteGroups(registered: readonly { name: string; description?: string }[], shortcuts: Readonly<Record<string, string | undefined>>, language: ResolvedLanguage = resolveLanguagePolicy().language): CommandPaletteGroup[] {
	const byName = new Map(registered.map((command) => [command.name, command]));
	const groups: CommandPaletteGroup[] = [];
	for (const group of COMMAND_PALETTE_CATALOG) {
		const items: CommandPaletteItem[] = [];
		for (const entry of group.items) {
			const found = byName.get(entry.command);
			if (!found) continue;
			const translated = translateCommandPaletteEntry(language, entry.command, group.title, entry.label, found.description);
			items.push({ command: entry.command, label: translated.label, description: translated.description, shortcut: shortcuts[entry.command] });
		}
		if (items.length > 0) groups.push({ title: translateCommandPaletteGroup(language, group.title), items });
	}
	return groups;
}

const ES_GROUPS: Record<string, string> = { Configuration: "Configuración", Session: "Sesión", Diagnostics: "Diagnóstico", Skills: "Habilidades" };
const ES_LABELS: Record<string, string> = {
	"gentle:models": "Asignar modelos y razonamiento", "gentle:profiles": "Perfiles de modelos de agentes", "gentle:persona": "Cambiar personalidad", "gentle:review-mode": "Modo de revisión (desarrollo basado en recibos)", "gentle:background-subagents": "Subagentes en segundo plano", "gentle:double-esc-cancel": "Requerir doble Esc para cancelar", "gentle:animations": "Modo de animación", "gentle:telemetry": "Telemetría", "gentle:banner": "Banner de inicio", "gentle:banner-color": "Color del banner", "gentle:toggle-rose": "Mostrar u ocultar rosa del banner", "gentle:toggle-text-logo": "Mostrar u ocultar logo de texto", "gentle:dev-binary": "Binario de desarrollo de Gentle AI", "gentle:language": "Idioma de la interfaz", "gentle:changes": "Ver cambios registrados", "gentle:agents": "Subagentes", "gentle:usage": "Uso de la suscripción", "gentle:review-session-permission": "Permiso de revisión de la sesión", "gentle:status": "Estado de Gentle AI", "gentle:doctor": "Diagnóstico", "gentle:sdd-preflight": "Comprobación previa SDD", "gentle-sdd-status": "Estado SDD", "gentle-sdd-continue": "Continuar SDD", "gentle-sdd-init": "Inicializar SDD", "skill-registry:refresh": "Actualizar registro de habilidades"
};
const ES_DESCRIPTIONS: Record<string, string> = {
	"gentle:models": "Configura los modelos globales de cada agente de el Gentleman.",
	"gentle:profiles": "Crea, cambia y administra perfiles globales de modelos de agentes de el Gentleman.",
	"gentle:persona": "Cambia la personalidad de el Gentleman entre gentleman y neutral.",
	"gentle:review-mode": "Consulta o configura el interruptor de desarrollo basado en recibos de Gentle AI (status|enable|disable).",
	"gentle:background-subagents": "Consulta o configura la política administrada de subagentes en segundo plano (status|enable|disable).",
	"gentle:double-esc-cancel": "Consulta o configura la preferencia de doble Esc para cancelar (status|enable|disable).",
	"gentle:animations": "Consulta o configura las animaciones globales (quality|performance|potato|status).",
	"gentle:telemetry": "Consulta o cambia la telemetría local de Gentle AI (status|enable|disable|preview).",
	"gentle:banner": "Configura el banner de inicio de Gentle Pi.",
	"gentle:banner-color": "Configura el color del banner de inicio.",
	"gentle:toggle-rose": "Muestra u oculta la rosa del banner de inicio.",
	"gentle:toggle-text-logo": "Muestra u oculta el logotipo de texto del banner de inicio.",
	"gentle:dev-binary": "Registra, consulta o elimina la sustitución persistente del binario de desarrollo de Gentle AI.",
	"gentle:language": "Consulta o cambia el idioma de la interfaz de Gentle Shell (auto|en|es).",
	"gentle:changes": "Explora los cambios de escritura/edición registrados en esta sesión y sus subagentes.",
	"gentle:agents": "Muestra los subagentes activos de esta sesión y permite consultar los orquestadores del perfil.",
	"gentle:usage": "Muestra las ventanas de uso de suscripción de los proveedores conectados. Pulsa r para actualizar.",
	"gentle:review-session-permission": "Consulta o revoca el permiso de revisión en memoria para esta sesión de Pi y repositorio Git.",
	"gentle:status": "Comprueba el paquete Gentle AI, los recursos SDD, OpenSpec y la configuración global para este proyecto.",
	"gentle:doctor": "Ejecuta diagnósticos de solo lectura de Gentle AI para este espacio de trabajo de Pi.",
	"gentle:sdd-preflight": "Ejecuta o reutiliza la comprobación previa SDD de la sesión; usa --edit para cambiar preferencias.",
	"gentle-sdd-status": "Muestra el estado determinista del cambio SDD y sus instrucciones.",
	"gentle-sdd-continue": "Resuelve el estado SDD y dirige de forma determinista la siguiente fase.",
	"gentle-sdd-init": "Detecta automáticamente el stack del proyecto e inicializa openspec/config.yaml para SDD.",
	"skill-registry:refresh": "Regenera .atl/skill-registry.md a partir de las fuentes locales de habilidades."
};
function translateCommandPaletteGroup(language: ResolvedLanguage, title: string): string { return language === "es" ? (ES_GROUPS[title] ?? title) : title; }
function translateCommandPaletteEntry(language: ResolvedLanguage, command: string, _group: string, label: string, description?: string): { label: string; description?: string } {
	if (language !== "es") return { label, description };
	return { label: ES_LABELS[command] ?? label, description: ES_DESCRIPTIONS[command] ?? description };
}

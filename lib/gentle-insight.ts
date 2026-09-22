export const INSIGHT_PHASE = {
	IDLE: "idle",
	UNDERSTANDING: "understanding",
	INVESTIGATING: "investigating",
	CHANGING: "changing",
	VERIFYING: "verifying",
	REVIEWING: "reviewing",
	PROBLEM: "problem",
	DONE: "done",
} as const;

export type InsightPhase = (typeof INSIGHT_PHASE)[keyof typeof INSIGHT_PHASE];

export interface InsightSnapshot {
	phase: InsightPhase;
	title: string;
	explanation: string;
	why: string;
	filesChanged: number;
	problemsSeen: number;
	problemsResolved: number;
	history: readonly string[];
}

interface ToolEvent {
	name: string;
	args?: Record<string, unknown>;
}

const TEST_COMMAND = /(^|\s)(test|vitest|jest|pytest|go test|cargo test|pnpm test|npm test|yarn test)(\s|$)/i;
const BUILD_COMMAND = /(^|\s)(build|typecheck|tsc|check|lint)(\s|$)/i;
const REVIEW_COMMAND = /git\s+(diff|status|show)|(^|\s)diff(\s|$)/i;

function commandOf(args?: Record<string, unknown>): string {
	return typeof args?.command === "string" ? args.command : "";
}

function pathOf(args?: Record<string, unknown>): string | undefined {
	const value = args?.path;
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function descriptionForTool(event: ToolEvent): Pick<InsightSnapshot, "phase" | "title" | "explanation" | "why"> {
	const name = event.name.toLowerCase();
	if (name === "read" || name === "grep" || name === "find") return {
		phase: INSIGHT_PHASE.UNDERSTANDING,
		title: "Entendiendo cómo funciona esta parte",
		explanation: "Está revisando el código y buscando las piezas relacionadas antes de decidir qué conviene cambiar.",
		why: "Conocer primero las conexiones reduce el riesgo de modificar una pieza aislada y provocar un problema en otra.",
	};
	if (name === "edit" || name === "write") return {
		phase: INSIGHT_PHASE.CHANGING,
		title: "Aplicando los cambios",
		explanation: "Ya ha pasado de investigar a modificar la solución. El trabajo todavía no se considera terminado.",
		why: "Después de cambiar código conviene comprobar el resultado: que una modificación parezca correcta no garantiza que el resto siga funcionando.",
	};
	if (name.startsWith("subagent_")) return {
		phase: INSIGHT_PHASE.INVESTIGATING,
		title: "Investigando una parte por separado",
		explanation: "Ha delegado una parte concreta del trabajo para poder estudiarla de forma independiente sin perder el objetivo principal.",
		why: "Separar una investigación compleja ayuda a mantener cada problema acotado y permite contrastar resultados antes de continuar.",
	};
	if (name === "bash") {
		const command = commandOf(event.args);
		if (TEST_COMMAND.test(command) || BUILD_COMMAND.test(command)) return {
			phase: INSIGHT_PHASE.VERIFYING,
			title: "Comprobando que el cambio funciona",
			explanation: "Está ejecutando comprobaciones automáticas para detectar errores o comportamientos que hayan dejado de funcionar después del cambio.",
			why: "Estas comprobaciones sirven como red de seguridad: permiten descubrir problemas que no siempre son visibles al leer el código.",
		};
		if (REVIEW_COMMAND.test(command)) return {
			phase: INSIGHT_PHASE.REVIEWING,
			title: "Revisando exactamente qué ha cambiado",
			explanation: "Está comparando el estado actual con el anterior para comprobar que los cambios se limitan a lo necesario.",
			why: "Revisar el conjunto final ayuda a detectar modificaciones accidentales, archivos olvidados o cambios que no pertenecen a la tarea.",
		};
	}
	return {
		phase: INSIGHT_PHASE.INVESTIGATING,
		title: "Trabajando en la siguiente parte",
		explanation: "Está utilizando una herramienta del proyecto para avanzar en la tarea.",
		why: "Gentle Insight no tiene suficiente información para explicar este paso con más precisión, así que evita atribuirle una intención que no puede verificar.",
	};
}

export class InsightTracker {
	private snapshotValue: InsightSnapshot = {
		phase: INSIGHT_PHASE.IDLE,
		title: "Esperando una tarea",
		explanation: "Cuando Gentle empiece a trabajar, aquí verás una explicación breve de lo que está ocurriendo.",
		why: "El panel se basa en acciones observables del agente y no intenta adivinar su razonamiento interno.",
		filesChanged: 0,
		problemsSeen: 0,
		problemsResolved: 0,
		history: [],
	};
	private readonly changedFiles = new Set<string>();
	private activeProblem = false;

	get snapshot(): InsightSnapshot { return this.snapshotValue; }

	beginTurn(): InsightSnapshot {
		this.changedFiles.clear();
		this.activeProblem = false;
		this.snapshotValue = {
			phase: INSIGHT_PHASE.UNDERSTANDING,
			title: "Entendiendo lo que hay que hacer",
			explanation: "Está situando la petición dentro del proyecto antes de empezar a cambiar cosas.",
			why: "Empezar por entender el contexto evita soluciones rápidas que no encajen con el resto del programa.",
			filesChanged: 0, problemsSeen: 0, problemsResolved: 0, history: [],
		};
		return this.snapshotValue;
	}

	toolStarted(event: ToolEvent): InsightSnapshot {
		const next = descriptionForTool(event);
		const path = (event.name === "edit" || event.name === "write") ? pathOf(event.args) : undefined;
		if (path) this.changedFiles.add(path);
		const history = this.snapshotValue.phase === next.phase
			? this.snapshotValue.history
			: [...this.snapshotValue.history, this.snapshotValue.title].slice(-5);
		this.snapshotValue = { ...this.snapshotValue, ...next, filesChanged: this.changedFiles.size, history };
		return this.snapshotValue;
	}

	toolEnded(event: ToolEvent & { isError?: boolean }): InsightSnapshot {
		if (event.isError) {
			this.activeProblem = true;
			this.snapshotValue = {
				...this.snapshotValue,
				phase: INSIGHT_PHASE.PROBLEM,
				title: "Ha aparecido un problema durante la comprobación",
				explanation: "Una de las acciones no ha terminado como se esperaba. Esto no significa necesariamente que la tarea haya fallado: ahora puede investigar la causa y corregirla.",
				why: "Detectar un fallo durante el trabajo es útil porque permite corregirlo antes de presentar el resultado como terminado.",
				problemsSeen: this.snapshotValue.problemsSeen + 1,
			};
			return this.snapshotValue;
		}
		if (this.activeProblem && (event.name === "bash" || event.name === "edit" || event.name === "write")) {
			this.activeProblem = false;
			this.snapshotValue = { ...this.snapshotValue, problemsResolved: this.snapshotValue.problemsResolved + 1 };
		}
		return this.snapshotValue;
	}

	finish(): InsightSnapshot {
		const hasProblem = this.activeProblem;
		this.snapshotValue = {
			...this.snapshotValue,
			phase: hasProblem ? INSIGHT_PHASE.PROBLEM : INSIGHT_PHASE.DONE,
			title: hasProblem ? "La tarea terminó con una comprobación pendiente" : "Trabajo terminado",
			explanation: hasProblem
				? "La última actividad observada terminó con un problema. Conviene revisar el detalle técnico antes de considerar cerrado el trabajo."
				: this.changedFiles.size > 0
					? `Ha terminado después de modificar ${this.changedFiles.size} ${this.changedFiles.size === 1 ? "archivo" : "archivos"}. El panel solo confirma lo que ha podido observar durante esta ejecución.`
					: "Ha terminado la ejecución sin cambios de archivos observados por Gentle Insight.",
			why: hasProblem
				? "Un resultado pendiente no debe presentarse como verificado hasta que exista una comprobación posterior correcta."
				: "Separar lo observado de lo supuesto permite entender el resultado sin convertir una explicación sencilla en una falsa garantía.",
		};
		return this.snapshotValue;
	}
}

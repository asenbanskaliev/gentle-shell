# ODD task — Gentle Shell UI language

## Outcome

Gentle Shell owns a small deterministic language layer, with English as the compatibility fallback and Spanish as the first additional locale. Persona, model routing, prompts, commands, and technical identifiers remain independent from UI language.

## SDD contract

- Persist global preference in `$GENTLE_PI_CONFIG_HOME/language.json` using schema `gentle-pi.language/v1`.
- Supported policies: `auto | en | es`.
- `auto` detects English/Spanish from standard locale environment and otherwise falls back to English.
- `/gentle:language` is the stable command; no-argument interactive use opens a selector, explicit arguments are scriptable.
- Writes are atomic and private, matching existing Gentle policy stores.
- Catalogs are deterministic. Runtime model calls are forbidden for fixed UI labels.
- English is the canonical catalog. Locale catalogs must have exact key and placeholder parity.
- Existing command names, model IDs, paths, branches, SDD/TDD/ODD terminology and provider identifiers are not translated.

## TDD evidence

RED requirements are encoded in `tests/language-policy.test.ts`: strict schema, locale resolution, explicit-over-auto precedence, atomic persistence, malformed-file fallback, catalog parity, placeholder parity and interpolation.

`tests/command-palette.test.ts` additionally proves that Spanish localizes curated group titles, labels, and every visible command description while preserving the exact command identifiers, and that explicit English preserves the existing labels/descriptions.

## ODD slices

- [x] Audit current policy-store and extension command patterns.
- [x] Add versioned language policy with safe fallback.
- [x] Add typed EN/ES catalog and interpolation.
- [x] Add `/gentle:language` interactive/scriptable command.
- [x] Add deterministic unit/contract tests.
- [x] Migrate the first bounded visual surface (curated Command Palette) without changing command IDs, shortcuts, ordering, or command behavior.
- [x] Audit the curated command palette: translate all user-facing group titles, labels, and descriptions; preserve command identifiers and technical arguments verbatim.
- [x] Run full cross-platform CI, typecheck, runtime-module verification and packed-package validation.
- [x] Audit diff and record final evidence before promotion.

## Command-description audit

Translate presentation copy owned by Gentle: command-palette group titles, labels, registered-command descriptions, selector titles, confirmations, notifications, status prose, overlay headings, hints, and user-facing validation/errors. Do not translate command identifiers, flags/sub-actions (`status`, `enable`, `disable`, `--edit`), paths, environment variables, model/provider IDs, JSON/schema/tool contracts, agent prompts/instructions, protocol tokens, Git refs, or SDD/TDD/ODD identifiers. Runtime/provider output is not blindly translated because doing so can alter machine-owned semantics.

The curated palette covers Configuration, Session, Diagnostics, SDD and Skills. Every curated command has an explicit Spanish description. Contract tests fail if an English live-description sentinel leaks into Spanish, if command identifiers change, or if explicit English stops preserving the existing presentation.

This task deliberately treats the Command Palette as the first bounded migrated visual surface. Further localization of command handlers, agents, review flows, persona/routing surfaces, provider output, or Pi semantics requires separately bounded follow-up work rather than silently widening this change.

## Final evidence

- Branch `feat/i18n-language` was compared with `main`: it is based on the current merge base with no behind commits at final audit time; the i18n change remains bounded to the language extension/policy/catalog, Command Palette catalog/tests, and this ODD record.
- CI run #18 on commit `09f4ce80d3d8f7be78d374844e64dffc778657da` completed successfully.
- `verify` passed tests, TypeScript typecheck, generated runtime-module verification, package-content verification, and packed-installation verification.
- `session-transport-macos` passed the Darwin session transport suite and runtime-module verification.
- `review-repository-windows` passed the Windows Git-authority, candidate-view, and native-consent boundary regressions.
- Final diff audit found no changes to persona, model routing, agent behavior, review policy, SDD execution semantics, worktree behavior, provider accounting, or persisted session semantics.

## Guardrails

Language is presentation state only. It must not alter persona, routing, agent behavior, review policy, SDD execution, worktrees, provider usage accounting, or persisted session semantics.

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

## ODD slices

- [x] Audit current policy-store and extension command patterns.
- [x] Add versioned language policy with safe fallback.
- [x] Add typed EN/ES catalog and interpolation.
- [x] Add `/gentle:language` interactive/scriptable command.
- [x] Add deterministic unit/contract tests.
- [ ] Migrate visual surfaces incrementally; each surface must preserve width/degradation contracts in both locales.
- [x] Audit the curated command palette: translate all user-facing group titles, labels, and descriptions; preserve command identifiers and technical arguments verbatim.
- [ ] Run full cross-platform CI, typecheck, provider contract, runtime harness and packed-package validation.
- [ ] Audit diff and record final evidence before promotion.

## Command-description audit

Translate presentation copy owned by Gentle: command-palette group titles, labels, registered-command descriptions, selector titles, confirmations, notifications, status prose, overlay headings, hints, and user-facing validation/errors. Do not translate command identifiers, flags/sub-actions (`status`, `enable`, `disable`, `--edit`), paths, environment variables, model/provider IDs, JSON/schema/tool contracts, agent prompts/instructions, protocol tokens, Git refs, or SDD/TDD/ODD identifiers. Runtime/provider output is not blindly translated because doing so can alter machine-owned semantics.

The curated palette currently covers Configuration, Session, Diagnostics, SDD and Skills. Every curated command now has an explicit Spanish description and tests fail if an English live-description sentinel leaks into Spanish or if command identifiers change.

## Guardrails

Language is presentation state only. It must not alter persona, routing, agent behavior, review policy, SDD execution, worktrees, provider usage accounting, or persisted session semantics.

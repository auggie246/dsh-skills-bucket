# 🪣 dsh-skills-bucket

DSH plugin bundle serving this repository's skills as runtime skills.

[![Node](https://img.shields.io/badge/node-%E2%89%A520-blue)](https://nodejs.org)
[![Skills](https://img.shields.io/badge/skills-26-3fb950)](#skills)
[![Issues](https://img.shields.io/github/issues/auggie246/dsh-skills-bucket)](https://github.com/auggie246/dsh-skills-bucket/issues)

[Background](#background) · [Install](#install) · [Usage](#usage) · [Skills](#skills) · [Maintainers](#maintainers) · [Thanks](#thanks)

A collection of agent skills for [DeepSeek Harness (DSH)](https://github.com/auggie246/dsh): authored in this repo or synced from upstream, and shipped as runtime skills by the bundle. Install it once, and every skill in it is available to your DSH agent — no per-skill copying, no drift between repo and profile.

The bundle does two things:

- **Serves 26 skills.** A Node entry point registers each `skills/` directory on the DSH skill registry at host start, so the npm package stays the single source of truth.
- **Vendored upstream snapshot.** 25 skills come from [mattpocock/skills](https://github.com/mattpocock/skills) at a pinned release tag, patched for DSH; 1 (`create-readme`) is authored here.

## Table of Contents

- [Background](#background)
- [Install](#install)
  - [Dependencies](#dependencies)
- [Usage](#usage)
  - [Install the bundle](#install-the-bundle)
  - [Copy chosen skills](#copy-chosen-skills)
  - [Sync from upstream](#sync-from-upstream)
  - [Verify](#verify)
- [Skills](#skills)
- [Maintainers](#maintainers)
- [Thanks](#thanks)

## Background

This repo is a home for agent skills for DeepSeek Harness (DSH), installable into a profile with one command. Skills live in `skills/`, one directory per skill, and the bundle serves all of them as runtime skills.

The catalog is a mix of two kinds of source:

- **Authored here** — skills written in this repo for DSH. Today that is one skill, `create-readme`.
- **Synced from upstream** — skills vendored from an external repo at a pinned release tag, patched for DSH. The sync machinery takes any upstream repo; today it sources 25 skills from [mattpocock/skills](https://github.com/mattpocock/skills).

Three decisions shape how the bundle works, each recorded as an ADR:

- **Runtime registration over file copy** — the plugin registers skills directly on the skill registry at host start. A package upgrade replaces them on restart; removing the package removes them. See [ADR-0002](docs/adr/0002-runtime-registration-over-file-copy.md).
- **Vendored upstream snapshot** — `sync-upstream.mjs` pulls a pinned release tag, applies overlay patches, and flattens the chosen categories into `skills/`. The tag pin makes a rebuild of the same bundle version reproduce the same skills. See [ADR-0003](docs/adr/0003-vendored-upstream-snapshot.md).
- **Source precedence** — where a skill combines sources that disagree, task-style scope bans win over structural specs. See [ADR-0001](docs/adr/0001-source-precedence-for-combined-skills.md).

The domain vocabulary — skill, spec resource, upstream source, bundle, runtime skill, overlay patch, pin, sync — is defined in [CONTEXT.md](CONTEXT.md).

## Install

1. Install the bundle into a DSH profile:

   ```sh
   dsh plugin --profile <name> add dsh-skills-bucket
   ```

2. Restart the harness. The bundle's host code registers every skill at start.

Prefer file copies over a profile? See [Copy chosen skills](#copy-chosen-skills).

### Dependencies

- [Node.js](https://nodejs.org) ≥ 20
- A DSH installation, for `dsh plugin add` (the bundle path)
- `git` and `tar`, only for the upstream sync script

> [!NOTE]
> `install.sh` is standalone and needs nothing but bash. The sync script needs network access to GitHub.

## Usage

### Install the bundle

```sh
dsh plugin --profile web add dsh-skills-bucket
```

The command appends the bundle to the profile via the shipped [Cordis patch](cordis.patch.yml). After a restart, the agent sees the skills by their trigger descriptions — for example, ask it to "review since main" or "grill me on this plan".

> [!IMPORTANT]
> Runtime skills outrank same-named copies in `$DSH_HOME/skills/`. A bundled skill cannot be overridden by editing the user skills directory — edit the package and restart instead. See [ADR-0002](docs/adr/0002-runtime-registration-over-file-copy.md).

> [!NOTE]
> Updates reach agents only after a harness restart, because the plugin code runs inside the host process.

### Copy chosen skills

`install.sh` copies skill folders straight into the DSH skills directory (`${DSH_HOME:-$HOME/.dsh}/skills/`). Re-installing replaces the copy, never merges.

```sh
git clone https://github.com/auggie246/dsh-skills-bucket
cd dsh-skills-bucket
./install.sh                 # all skills
./install.sh grilling tdd    # chosen skills
```

### Sync from upstream

`scripts/sync-upstream.mjs` re-syncs the vendored snapshot. Only names recorded in [upstream.lock.json](upstream.lock.json) are ever replaced; `create-readme` is never touched. A stale overlay patch is skipped with a warning, never a broken sync.

```sh
node scripts/sync-upstream.mjs                       # re-sync at the locked tag
node scripts/sync-upstream.mjs --latest-tag          # move the pin to the newest release tag
node scripts/sync-upstream.mjs --upstream-ref v1.2.3 # sync at an explicit tag
node scripts/sync-upstream.mjs --patch-ref <ref>     # pin the patch source
node scripts/sync-upstream.mjs --patches <dir>       # use local patches (offline)
node scripts/sync-upstream.mjs --categories "<list>" # default: engineering productivity
```

The bundle pins release tags only — never a branch or a bare commit.

### Verify

```sh
npm test
```

The smoke test runs the plugin's `apply()` against a stub skill registry and asserts that every bundled skill registers with parsed frontmatter, a clean body, and a reachable resource base — and that patched skills carry their DSH note.

## Skills

26 skills ship in the bundle. 25 are synced from [mattpocock/skills](https://github.com/mattpocock/skills); `create-readme` is authored in this repo.

| Skill | Description | Source |
| --- | --- | --- |
| [ask-matt](skills/ask-matt) | Ask which skill or flow fits your situation. A router over the skills in this repo. | synced |
| [codebase-design](skills/codebase-design) | Shared vocabulary for designing deep modules: interfaces, seams, deepening opportunities, testability. | synced |
| [code-review](skills/code-review) | Review changes since a fixed point along two axes — standards and spec — in parallel sub-agents. | synced |
| [create-readme](skills/create-readme) | Create or rewrite a standards-compliant `README.md` for the current project. | authored |
| [diagnosing-bugs](skills/diagnosing-bugs) | Diagnosis loop for hard bugs and performance regressions. | synced |
| [domain-modeling](skills/domain-modeling) | Build and sharpen a project's domain model; record architectural decisions. | synced |
| [grilling](skills/grilling) | Grill the user relentlessly about a plan, decision, or idea. | synced, patched |
| [grill-me](skills/grill-me) | A relentless interview to sharpen a plan or design. | synced |
| [grill-with-docs](skills/grill-with-docs) | A relentless interview that also creates docs (ADRs and glossary) as it goes. | synced |
| [handoff](skills/handoff) | Compact the current conversation into a handoff document for another agent. | synced |
| [implement](skills/implement) | Implement a piece of work based on a spec or set of tickets. | synced |
| [improve-codebase-architecture](skills/improve-codebase-architecture) | Scan a codebase for deepening opportunities, present them as a visual HTML report. | synced |
| [prototype](skills/prototype) | Build a throwaway prototype to answer a design question. | synced |
| [research](skills/research) | Investigate a question against high-trust primary sources; capture findings as a Markdown file. | synced |
| [resolving-merge-conflicts](skills/resolving-merge-conflicts) | Resolve an in-progress git merge or rebase conflict. | synced |
| [setup-matt-pocock-skills](skills/setup-matt-pocock-skills) | Configure a repo for the engineering skills: issue tracker, triage labels, domain docs. | synced |
| [tdd](skills/tdd) | Test-driven development: red-green-refactor, mocking, integration tests. | synced |
| [teach](skills/teach) | Teach the user a new skill or concept, within this workspace. | synced |
| [to-questionnaire](skills/to-questionnaire) | Turn a decision you cannot answer into a questionnaire for someone else. | synced |
| [to-spec](skills/to-spec) | Turn the current conversation into a spec and publish it to the issue tracker. | synced |
| [to-tickets](skills/to-tickets) | Break a plan or spec into tracer-bullet tickets with blocking edges. | synced |
| [triage](skills/triage) | Move issues and external PRs through a state machine of triage roles. | synced |
| [wait-what](skills/wait-what) | Stop. That last message did not land — re-pitch it. | synced |
| [wayfinder](skills/wayfinder) | Plan a huge chunk of work as a shared map of decision tickets; resolve one at a time. | synced |
| [wizard](skills/wizard) | Generate an interactive bash wizard for steps only a human can perform. | synced |
| [writing-for-agents](skills/writing-for-agents) | Write documents for agents: skills, `AGENTS.md`, `CLAUDE.md`. | synced |

> [!TIP]
> "patched" means an [overlay patch](https://github.com/auggie246/dsh-mattpocock-skills) appends a "DSH note: asking the user" section, rerouting the skill's ask-the-user moments through the `ask_user_question` tool.

## Maintainers

- [@auggie246](https://github.com/auggie246)

## Thanks

- [Matt Pocock](https://github.com/mattpocock) — the [skills](https://github.com/mattpocock/skills) repo is the upstream source for 25 of the skills in this bundle.
- [Richard Litt](https://github.com/RichardLitt) — the [standard-readme](https://github.com/RichardLitt/standard-readme) spec shapes the `create-readme` skill, and this README.

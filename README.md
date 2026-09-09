# 🪣 dsh-skills-bucket

DSH plugin bundle serving this repository's skills as runtime skills.

[![Node](https://img.shields.io/badge/node-%E2%89%A520-blue)](https://nodejs.org)
[![Skills](https://img.shields.io/badge/skills-32-3fb950)](#skills)
[![Issues](https://img.shields.io/github/issues/auggie246/dsh-skills-bucket)](https://github.com/auggie246/dsh-skills-bucket/issues)

[Background](#background) · [Install](#install) · [Usage](#usage) · [Skills](#skills) · [Maintainers](#maintainers) · [Thanks](#thanks)

A collection of agent skills for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness): authored in this repo or synced from upstream, and shipped as runtime skills by the bundle. Install it once, and every skill in it is available to your DSH agent — no per-skill copying, no drift between repo and profile.

The bundle does two things:

- **Serves 32 skills.** A Node entry point registers each `skills/` directory on the DSH skill registry at host start, so the npm package stays the single source of truth.
- **Vendored upstream snapshots.** 31 skills come from two upstream repos at pinned release tags, patched for DSH where needed: 25 from [mattpocock/skills](https://github.com/mattpocock/skills) and 6 from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail); 1 (`create-readme`) is authored here.

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
- **Synced from upstream** — skills vendored from an external repo at a pinned release tag, patched for DSH. The sync machinery takes any upstream repo; today it sources 25 skills from [mattpocock/skills](https://github.com/mattpocock/skills) and 6 from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

Three decisions shape how the bundle works, each recorded as an ADR:

- **Runtime registration over file copy** — the plugin registers skills directly on the skill registry at host start. A package upgrade replaces them on restart; removing the package removes them. See [ADR-0002](docs/adr/0002-runtime-registration-over-file-copy.md).
- **Vendored upstream snapshot** — `sync-upstream.mjs` pulls each recorded upstream's pinned release tag, applies overlay patches, and flattens the discovered skills into `skills/`. The tag pins make a rebuild of the same bundle version reproduce the same skills. See [ADR-0003](docs/adr/0003-vendored-upstream-snapshot.md) and [ADR-0004](docs/adr/0004-multi-upstream-sync.md).
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

`scripts/sync-upstream.mjs` re-syncs the vendored snapshots. Only names recorded in [upstream.lock.json](upstream.lock.json) are ever replaced; `create-readme` is never touched. A stale overlay patch is skipped with a warning, never a broken sync. A skill name claimed by two upstreams is an error.

```sh
node scripts/sync-upstream.mjs                                  # re-sync every source at its pinned tag
node scripts/sync-upstream.mjs --repo <owner/name>              # re-sync one source at its pinned tag
node scripts/sync-upstream.mjs --repo <r> --latest-tag          # move that source's pin to the newest release tag
node scripts/sync-upstream.mjs --repo <r> --upstream-ref v1.2.3 # sync one source at an explicit tag
node scripts/sync-upstream.mjs --repo <r> --categories "<list>" # override that source's categories
node scripts/sync-upstream.mjs --add-source <repo> --layout flat|categories \
     [--categories "<list>"] [--patches-repo <repo>] --upstream-ref <tag>
                                                                # record a new sync source and sync it
node scripts/sync-upstream.mjs --patch-ref <ref>                # pin the patch source
node scripts/sync-upstream.mjs --patches <dir>                  # use local patches (offline)
```

The bundle pins release tags only — never a branch or a bare commit. A flat-layout upstream (one `skills/<name>/SKILL.md` level, like ponytail) needs no categories; a category-nested one (like mattpocock's) lists them. Multi-line frontmatter descriptions are folded into single lines at sync time, so every vendored skill parses.

### Verify

```sh
npm test
```

The smoke test runs the plugin's `apply()` against a stub skill registry and asserts that every bundled skill registers with parsed frontmatter, a clean body, and a reachable resource base — and that patched skills carry their DSH note.

## Skills

32 skills ship in the bundle, from three collections:

| Collection | Focus | Skills |
| --- | --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Engineering and productivity: code review, TDD, debugging, domain modeling, spec and ticket flows, triage, research. | 25 |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | Lazy senior dev mode: the simplest solution that works, plus repo audit, diff review, and debt tracking. | 6 |
| Authored here | [`create-readme`](skills/create-readme): standards-compliant `README.md` authoring. | 1 |

Every synced skill is vendored at a pinned release tag — see [Background](#background) for how sync works. Browse [skills/](skills/) for the full list of skill directories.

> [!TIP]
> 13 of the mattpocock skills carry an [overlay patch](https://github.com/auggie246/dsh-mattpocock-skills): it appends a "DSH note: asking the user" section, rerouting the skill's ask-the-user moments through the `ask_user_question` tool.

## Maintainers

- [@auggie246](https://github.com/auggie246)

## Thanks

- [Matt Pocock](https://github.com/mattpocock) — the [skills](https://github.com/mattpocock/skills) repo is the upstream source for 25 of the skills in this bundle.
- [Dietrich Gepert](https://github.com/DietrichGebert) — [ponytail](https://github.com/DietrichGebert/ponytail) is the upstream source for 6 of the skills in this bundle.
- [Richard Litt](https://github.com/RichardLitt) — the [standard-readme](https://github.com/RichardLitt/standard-readme) spec shapes the `create-readme` skill, and this README.

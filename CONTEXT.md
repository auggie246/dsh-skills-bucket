# dsh-skills-bucket

A collection of agent skills for DeepSeek Harness (DSH), authored in this repo or synced from upstream, and shipped as runtime skills by the bundle.

## Language

**Skill**:
A reusable set of Markdown instructions for the DSH agent; one directory per skill under `skills/`.
_Avoid_: plugin, prompt, command

**SKILL.md**:
The entry file of a skill; holds the frontmatter (`name`, `description`) and the always-loaded instructions.

**Spec resource**:
A supporting file shipped beside `SKILL.md` (for example, a verbatim copy of an external specification), loaded only when `SKILL.md` points to it.

**Upstream source**:
An external document a skill is derived from, such as the standard-readme spec or an awesome-copilot prompt.

**Bundle**:
This repository packaged as an npm package installable into a DSH profile with `dsh plugin --profile <name> add <package>`; it ships a Cordis patch (`cordis.patch.yml`) that mounts the host row.

**Runtime skill**:
A skill registered on the skill registry by the bundle's host code, instead of a file the filesystem provider discovers. Runtime skills outrank same-named user-directory copies.

**Install**:
Two mechanisms exist. `install.sh` copies a skill folder into the DSH skills directory (`${DSH_HOME:-$HOME/.dsh}/skills/`); re-installing replaces the copy, never merges. `dsh plugin add` installs the bundle into a profile; its runtime skills then shadow the file copies.

**Overlay patch**:
A fork-local `.patch` under `patches/` in `auggie246/dsh-mattpocock-skills`; each appends a "DSH note: asking the user" section to one upstream skill, rerouting its ask-the-user moments through the `ask_user_question` tool. A stale overlay patch leaves its skill unpatched.

**Pin**:
The upstream release tag recorded in `upstream.lock.json`. The bundle pins release tags only; a branch or a bare commit is never a pin.

**Sync**:
`scripts/sync-upstream.mjs`: pulls the pinned upstream release tag, applies every overlay patch, flattens the chosen categories into `skills/`, and rewrites `upstream.lock.json`. A bare re-run repeats the locked tag; `--latest-tag` moves the pin.

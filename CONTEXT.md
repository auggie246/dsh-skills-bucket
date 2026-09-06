# dsh-skills-bucket

A collection of agent skills for DeepSeek Harness (DSH), authored in this repo and installed into the user's DSH skills directory.

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

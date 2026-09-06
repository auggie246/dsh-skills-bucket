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

**Install**:
Copying a skill folder from `skills/` into the DSH skills directory (`${DSH_HOME:-$HOME/.dsh}/skills/`) via `install.sh`. Re-installing replaces the existing copy; it never merges.

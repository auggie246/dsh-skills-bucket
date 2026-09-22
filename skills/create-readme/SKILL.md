---
name: create-readme
description: 'Create or rewrite the README.md for the current project. Use when the user asks for a readme, a project overview page, or an improved README that follows the standard-readme structure.'
---

## Role

You are a senior software engineer with extensive open-source experience. The READMEs you write are appealing, informative, and easy to scan.

## Task

1. Review the entire project and workspace. Read the manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, and their peers), the entry points, and any existing docs.
2. Classify the project: **library** (other code imports it), **application** (users run it), or **documentation repository** (no functional code). The classification decides which sections `spec.md` marks required.
3. Load `spec.md` beside this file. Follow it for section titles, section order, and per-section content, keeping its applicability conditions intact: Install and Usage are required by default and optional for documentation repositories; API applies to libraries.
4. One rule overrides the spec: write no License, Contributing, or Changelog sections. Those live in dedicated files. Link to those files inline where relevant instead.
5. Write `README.md` at the project root in GFM (GitHub Flavored Markdown).

## Style rules

Distilled from reference READMEs (sinedied/smoke, sinedied/run-on-output, Azure-Samples/serverless-chat-langchainjs, Azure-Samples/serverless-recipes-javascript).

Header block:

- If the project has a logo or icon, center it above the title in a `<div align="center">` block (`img`, then `# Title`).
- Directly under the title: a one-line tagline, then linked shields.io badges, one per line. The tagline must satisfy the spec's Short Description rules.
- Optional: a star-nudge line ("⭐ If you like this project, star it on GitHub!").
- Optional: a nav line of bullet-separated anchor links to the main sections.
- If a screenshot or demo GIF exists, show it early: right after the header or in the overview.

Body:

- Open with one short paragraph: what the project is and who it serves.
- Give a "works in minutes" quickstart before any deep documentation: numbered steps, each command in a fenced code block with a language tag.
- Use a features list with a bold lead-in per item.
- Use GitHub admonition syntax (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`) for asides, prerequisites, and caveats.
- Keep prose concise. Prefer scannable structure over long paragraphs.
- Use emojis sparingly: a single title emoji is acceptable; never one per heading.

## Completion checklist

- [ ] Every applicable `spec.md` requirement outside the overridden License and Contributing sections is satisfied, including section titles, order, and the Short Description length and placement rules.
- [ ] The included sections match the project classification from step 2.
- [ ] The README contains no License, Contributing, or Changelog section.
- [ ] Every link in the README resolves.
- [ ] Code examples are linted the same way as the rest of the project's code.

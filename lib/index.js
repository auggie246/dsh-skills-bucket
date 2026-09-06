import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-skills-bucket'

// `skills` is consumed optionally, through ctx.inject in apply(): a profile
// without the skill registry simply gets no registrations.
export const inject = []

/** Absolute directory of the bundled skills, resolved from this module. */
export const SKILLS_ROOT = fileURLToPath(new URL('../skills/', import.meta.url))

const KEBAB_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * Parse the YAML frontmatter block that must open a SKILL.md. Only flat,
 * single-line `key: value` scalars are read — keep skill frontmatter flat.
 * Surrounding single or double quotes are stripped from values. Returns the
 * fields map plus the body with the frontmatter block removed. A missing or
 * misplaced block throws.
 */
export function parseFrontmatter(text, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (match === null) {
    throw new Error(`${file} must open with a --- frontmatter block`)
  }
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line)
    if (entry === null) continue
    let value = entry[2].trim()
    const quote = value[0]
    if ((quote === "'" || quote === '"') && value.length > 1 && value[value.length - 1] === quote) {
      value = value.slice(1, -1)
    }
    fields[entry[1]] = value
  }
  const body = match[0].length < text.length ? text.slice(match[0].length).replace(/^\r?\n+/, '') : ''
  return { fields, body }
}

/**
 * Register every skill under `skills/` on the skill registry at host start.
 * Each skill directory holds a SKILL.md (parsed here) plus any resource
 * files; `resourceBase` points agents at the directory so those resources
 * stay reachable. Registration is the only source of truth: a package
 * upgrade replaces the registrations on restart, and removing the package
 * removes the skills. A directory without a valid SKILL.md logs a warning
 * and is skipped; a bad skill never blocks the host.
 */
export function apply(ctx, { skillsRoot = SKILLS_ROOT } = {}) {
  ctx.inject(['skills'], (skillCtx) => {
    let entries
    try {
      entries = readdirSync(skillsRoot, { withFileTypes: true })
    } catch (error) {
      ctx.logger?.warn?.(`dsh-skills-bucket: cannot read ${skillsRoot} (${error.message})`)
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = join(skillsRoot, entry.name)
      const file = join(dir, 'SKILL.md')
      try {
        const { fields, body } = parseFrontmatter(readFileSync(file, 'utf8'), file)
        const { name: skillName, description, whenToUse } = fields
        if (typeof skillName !== 'string' || !KEBAB_NAME.test(skillName)) {
          throw new Error(`frontmatter name ${JSON.stringify(skillName ?? null)} is not kebab-case`)
        }
        if (typeof description !== 'string' || description === '') {
          throw new Error('frontmatter requires a non-empty description')
        }
        skillCtx.skills.register({
          name: skillName,
          description,
          ...(whenToUse ? { whenToUse } : {}),
          source: 'dsh-skills-bucket',
          content: body,
          resourceBase: { kind: 'directory', path: dir },
        })
      } catch (error) {
        ctx.logger?.warn?.(`dsh-skills-bucket: skipping ${file} (${error.message})`)
      }
    }
  })
}

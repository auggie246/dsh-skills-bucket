import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-skills-bucket'

// `skills` is consumed optionally, through ctx.inject in apply(): a profile
// without the skill registry simply gets no registrations.
export const inject = []

/** Absolute directory of the bundled skills, resolved from this module. */
export const SKILLS_ROOT = fileURLToPath(new URL('../skills/', import.meta.url))

const KEBAB_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

// Ponytail default mode — the same contract as the upstream hook resolver
// (DietrichGebert/ponytail hooks/ponytail-config.js): PONYTAIL_DEFAULT_MODE
// wins, then defaultMode in the ponytail config file (XDG_CONFIG_HOME, then
// %APPDATA% on Windows, then ~/.config), then 'full'. Only runtime levels are
// valid defaults; upstream's 'review' is a session-only mode, never a default.
export const PONYTAIL_MODES = ['off', 'lite', 'full', 'ultra']
const PONYTAIL_SKILL = 'ponytail'

function ponytailConfigPath(env) {
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, 'ponytail', 'config.json')
  if (process.platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'ponytail', 'config.json')
  return join(homedir(), '.config', 'ponytail', 'config.json')
}

function ponytailModeFrom(value) {
  if (typeof value !== 'string') return null
  const mode = value.trim().toLowerCase()
  return PONYTAIL_MODES.includes(mode) ? mode : null
}

/**
 * Resolve ponytail's default mode exactly like the upstream hook resolver. An
 * invalid or missing value falls through to the next source and never fails.
 * @param {{ env?: Record<string, string | undefined>, configPath?: string }} [overrides]
 *   test seams; production reads process.env and the real config file.
 */
export function resolvePonytailMode(overrides = {}) {
  const env = overrides.env ?? process.env
  const fromEnv = ponytailModeFrom(env.PONYTAIL_DEFAULT_MODE)
  if (fromEnv) return fromEnv
  try {
    const config = JSON.parse(
      readFileSync(overrides.configPath ?? ponytailConfigPath(env), 'utf8').replace(/^\uFEFF/, ''),
    )
    const fromConfig = ponytailModeFrom(config?.defaultMode)
    if (fromConfig) return fromConfig
  } catch {
    // No config file or invalid JSON falls through, like the original.
  }
  return 'full'
}

// The ponytail skill states its default twice: "Default: **full**" in the
// Persistence section, and a "Default." marker on the full row of the
// intensity table. A non-full default is applied by moving both markers, so
// invoking the skill starts at the configured level. The strings come from
// ponytail v4.9.0; if upstream rephrases them the rewrite no-ops, and apply()
// warns so the drift surfaces instead of silently keeping the old default.
const PONYTAIL_DEFAULT_LINE = 'Default: **full**'
const PONYTAIL_FULL_ROW_MARKER = 'Shortest diff, shortest explanation. Default. |'
const PONYTAIL_ROW_MARKERS = {
  lite: {
    from: 'name the lazier alternative in one line. User picks. |',
    to: 'name the lazier alternative in one line. User picks. Default. |',
  },
  ultra: {
    from: 'challenge the rest of the requirement in the same breath. |',
    to: 'challenge the rest of the requirement in the same breath. Default. |',
  },
}

/** Rewrite the ponytail skill body so its stated default level is `mode`. */
export function applyPonytailDefault(body, mode) {
  if (mode === 'full') return body
  const marker = PONYTAIL_ROW_MARKERS[mode]
  return body
    .replace(PONYTAIL_DEFAULT_LINE, `Default: **${mode}**`)
    .replace(PONYTAIL_FULL_ROW_MARKER, PONYTAIL_FULL_ROW_MARKER.replace(' Default.', ''))
    .replace(marker.from, marker.to)
}

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
 *
 * The ponytail mode skill adapts to the configured default mode
 * (resolvePonytailMode): 'off' skips its registration, a non-full level is
 * written into the skill body, 'full' registers verbatim. Pass
 * `ponytailMode` to pin the level (test seam); production resolves the
 * environment and config file.
 */
export function apply(ctx, { skillsRoot = SKILLS_ROOT, ponytailMode } = {}) {
  const mode = ponytailMode ?? resolvePonytailMode()
  if (!PONYTAIL_MODES.includes(mode)) {
    throw new Error(`ponytailMode must be one of ${PONYTAIL_MODES.join('|')}, got ${JSON.stringify(ponytailMode)}`)
  }
  ctx.inject(['skills'], (skillCtx) => {
    if (mode !== 'full') {
      ctx.logger?.info?.(`dsh-skills-bucket: ponytail default mode is ${mode}`)
    }
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
        let content = body
        if (skillName === PONYTAIL_SKILL) {
          if (mode === 'off') {
            ctx.logger?.info?.('dsh-skills-bucket: ponytail mode is off; the ponytail skill stays unregistered')
            continue
          }
          if (mode !== 'full') {
            content = applyPonytailDefault(body, mode)
            if (content === body) {
              ctx.logger?.warn?.('dsh-skills-bucket: the configured ponytail default could not be applied; upstream text drifted from the expected markers')
            }
          }
        }
        skillCtx.skills.register({
          name: skillName,
          description,
          ...(whenToUse ? { whenToUse } : {}),
          source: 'dsh-skills-bucket',
          content,
          resourceBase: { kind: 'directory', path: dir },
        })
      } catch (error) {
        ctx.logger?.warn?.(`dsh-skills-bucket: skipping ${file} (${error.message})`)
      }
    }
  })
}

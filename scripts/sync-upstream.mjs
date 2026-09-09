// sync-upstream.mjs — pull skills from upstream repos into this bundle, patched for DSH.
//
// The bundle pins the latest upstream RELEASE TAG (never a branch or a bare
// commit) per sync source. A sync source is one upstream repo recorded in
// upstream.lock.json with its layout and optional patch repo. Every run:
// download the tagged upstream tarball, apply the source's overlay patches
// (if any), fold multi-line frontmatter descriptions into single lines, then
// flatten the discovered skills into skills/. Only names recorded in
// upstream.lock.json are ever replaced; anything else in skills/ (for
// example create-readme) is never touched. A stale patch is skipped with a
// warning, never a broken sync. A skill name claimed by two sources is an
// error: cross-repo duplicates are ambiguous, so sync refuses to guess.
//
// Usage:
//   node scripts/sync-upstream.mjs                          re-sync every source at its pinned tag
//   node scripts/sync-upstream.mjs --repo <owner/name>      re-sync one source at its pinned tag
//   node scripts/sync-upstream.mjs --repo <r> --latest-tag  move that source's pin to the newest release tag
//   node scripts/sync-upstream.mjs --add-source <repo> --layout flat|categories \
//        [--categories "<list>"] [--patches-repo <repo>] --upstream-ref <tag> | --latest-tag
//                                                           record a new sync source and sync it
//   node scripts/sync-upstream.mjs --repo <r> --upstream-ref v1.2.3   sync one source at an explicit tag
//   node scripts/sync-upstream.mjs --repo <r> --categories "<list>"   override that source's categories
//   node scripts/sync-upstream.mjs --patch-ref <ref>        pin the patch source ref
//   node scripts/sync-upstream.mjs --patches <dir>          use local patches (offline)

import { execFile } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILLS_DIR = join(REPO_ROOT, 'skills')
const LOCK_FILE = join(REPO_ROOT, 'upstream.lock.json')

const DEFAULT_CATEGORIES = ['engineering', 'productivity']

function usage(message) {
  if (message) console.error(`error: ${message}`)
  console.error('usage: node scripts/sync-upstream.mjs [--repo <owner/name>] [--latest-tag | --upstream-ref <tag>]')
  console.error('       [--add-source <repo> --layout flat|categories] [--categories "<list>"] [--patches-repo <repo>]')
  console.error('       [--patch-ref <ref>] [--patches <dir>]')
  process.exit(2)
}

function parseArgs(argv) {
  const args = {
    addSource: null,
    repo: null,
    latestTag: false,
    upstreamRef: null,
    layout: null,
    categories: null,
    patchesRepo: null,
    patchRef: 'HEAD',
    patchesDir: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--add-source') args.addSource = argv[++i] ?? usage('--add-source needs a repo')
    else if (flag === '--repo') args.repo = argv[++i] ?? usage('--repo needs owner/name')
    else if (flag === '--latest-tag') args.latestTag = true
    else if (flag === '--upstream-ref') args.upstreamRef = argv[++i] ?? usage('--upstream-ref needs a tag')
    else if (flag === '--layout') args.layout = argv[++i] ?? usage('--layout needs flat or categories')
    else if (flag === '--categories') args.categories = (argv[++i] ?? usage('--categories needs a list')).split(/\s+/).filter(Boolean)
    else if (flag === '--patches-repo') args.patchesRepo = argv[++i] ?? usage('--patches-repo needs owner/name')
    else if (flag === '--patch-ref') args.patchRef = argv[++i] ?? usage('--patch-ref needs a ref')
    else if (flag === '--patches') args.patchesDir = argv[++i] ?? usage('--patches needs a directory')
    else usage(`unknown flag: ${flag}`)
  }
  if (args.layout !== null && args.layout !== 'flat' && args.layout !== 'categories') {
    usage(`--layout must be flat or categories, got: ${args.layout}`)
  }
  return args
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

async function fetchTo(url, file) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  const body = Buffer.from(await response.arrayBuffer())
  writeFileSync(file, body)
}

async function resolveTag(repo, tag) {
  // Refuse non-tag refs: the pin policy is release tags only.
  try {
    await fetchJson(`https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`)
  } catch {
    throw new Error(`${tag} is not a tag on ${repo}; the bundle pins release tags only`)
  }
  // commits/<ref> dereferences an annotated tag to its commit sha.
  const commit = await fetchJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(tag)}`)
  return commit.sha
}

async function latestReleaseTag(repo) {
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`)
  return release.tag_name
}

async function resolvePatchRef(repo, ref) {
  const commit = await fetchJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`)
  return commit.sha
}

async function downloadTarball(repo, ref, file) {
  await fetchTo(`https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(ref)}`, file)
  const dir = file + '.d'
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await run('tar', ['-xzf', file, '-C', dir])
  const entries = readdirSync(dir)
  if (entries.length !== 1) throw new Error(`tarball from ${repo}@${ref} unpacked to ${entries.length} roots`)
  return join(dir, entries[0])
}

// Apply one patch inside the upstream tree. Returns 'applied', 'already', or 'stale'.
async function applyPatch(patchFile, upstreamRoot) {
  const rel = patchFile
  try {
    await run('git', ['apply', '--check', rel], { cwd: upstreamRoot })
    await run('git', ['apply', rel], { cwd: upstreamRoot })
    return 'applied'
  } catch {
    try {
      await run('git', ['apply', '--check', '--reverse', rel], { cwd: upstreamRoot })
      return 'already'
    } catch {
      try {
        await run('patch', ['--forward', '--silent', '-p1', '-d', upstreamRoot, '-i', rel])
        return 'applied'
      } catch {
        return 'stale'
      }
    }
  }
}

function listSkillDirs(root, layout, categories) {
  const pairs = new Map()
  if (layout === 'flat') {
    // <root>/skills/<skill>/SKILL.md — one level, no categories.
    const dir = join(root, 'skills')
    if (!existsSync(dir)) throw new Error(`no skills/ directory under ${root}`)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !existsSync(join(dir, entry.name, 'SKILL.md'))) continue
      pairs.set(entry.name, { category: 'skills', name: entry.name, src: join(dir, entry.name) })
    }
    return [...pairs.values()]
  }
  // <root>/skills/<category>/<skill>/SKILL.md, flattened by the caller.
  // A duplicate name across categories warns; the later category wins, matching
  // the upstream installer's manifest semantics.
  for (const category of categories) {
    const dir = join(root, 'skills', category)
    if (!existsSync(dir)) {
      console.warn(`warning: category '${category}' not found upstream; skipping`)
      continue
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !existsSync(join(dir, entry.name, 'SKILL.md'))) continue
      if (pairs.has(entry.name)) {
        console.warn(`warning: duplicate skill name '${entry.name}' (${pairs.get(entry.name).category}); later category wins`)
      }
      pairs.set(entry.name, { category, name: entry.name, src: join(dir, entry.name) })
    }
  }
  return [...pairs.values()]
}

// Fold a multi-line YAML block-scalar description (`description: >` with
// indented lines) into one single-line scalar. DSH skill frontmatter is flat
// single-line scalars (lib/index.js parseFrontmatter), so a block scalar would
// register as '>' and break the skill's trigger. A '|' literal block fails:
// folding it would silently change line breaks into spaces. Idempotent: a
// single-line description never matches the block header.
function foldDescription(text, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (match === null) return text
  const lines = match[1].split(/\r?\n/)
  const out = []
  let changed = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const header = /^description:[ \t]*([>|][0-9+-]*)[ \t]*$/.exec(line)
    if (header === null) {
      out.push(line)
      continue
    }
    if (header[1].startsWith('|')) {
      throw new Error(`${file}: description uses a '|' literal block; fold it to a single line before syncing`)
    }
    const folded = []
    let j = i + 1
    for (; j < lines.length; j++) {
      if (lines[j].trim() === '') {
        folded.push('')
        continue
      }
      if (/^[ \t]/.test(lines[j])) folded.push(lines[j].trim())
      else break
    }
    if (folded.length === 0) {
      out.push(line)
      continue
    }
    out.push(`description: ${folded.join(' ').replace(/\s+/g, ' ').trim()}`)
    changed = true
    i = j - 1
  }
  if (!changed) return text
  const trailingNewline = /\r?\n$/.test(match[0])
  return '---\n' + out.join('\n') + '\n---' + (trailingNewline ? '\n' : '') + text.slice(match[0].length)
}

// v1 locks held one upstream; normalize them into the v2 sources array so a
// bare re-sync after this script upgrades the format without a re-download.
function normalizeLock(lock) {
  if (!lock) return { sources: [] }
  if (Array.isArray(lock.sources)) return lock
  if (!lock.upstream) throw new Error('upstream.lock.json has neither sources[] nor the v1 upstream block')
  console.warn('warning: upgrading v1 upstream.lock.json to the sources[] format')
  return {
    sources: [
      {
        repo: lock.upstream.repo,
        ref: lock.upstream.ref,
        sha: lock.upstream.sha,
        layout: 'categories',
        categories: lock.categories ?? [...DEFAULT_CATEGORIES],
        patches: lock.patches ? { repo: lock.patches.repo, ref: lock.patches.ref, sha: lock.patches.sha } : null,
        skills: lock.skills ?? [],
      },
    ],
    syncedAt: lock.syncedAt,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const lock = normalizeLock(existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : null)

  if (!args.addSource && (args.latestTag || args.upstreamRef) && !args.repo) {
    usage('--latest-tag / --upstream-ref need --repo <owner/name> (or --add-source)')
  }
  if (!args.addSource && (args.layout !== null || args.patchesRepo)) {
    usage('--layout / --patches-repo are only valid with --add-source')
  }
  if (!args.addSource && args.categories && !args.repo) {
    usage('--categories needs --repo <owner/name> (or --add-source)')
  }
  if (args.addSource && !args.upstreamRef && !args.latestTag) {
    usage('--add-source needs --upstream-ref <tag> or --latest-tag')
  }
  if (args.addSource && !args.layout) {
    usage('--add-source needs --layout flat or categories')
  }

  // Pick the sources to sync: the new one, the named one, or all of them.
  const isNewSource = args.addSource !== null
  if (isNewSource && lock.sources.some((s) => s.repo === args.addSource)) {
    usage(`sync source ${args.addSource} already exists in upstream.lock.json`)
  }
  const targets = []
  if (isNewSource) {
    targets.push({
      repo: args.addSource,
      ref: null,
      sha: null,
      layout: args.layout,
      categories: args.categories ?? (args.layout === 'categories' ? [...DEFAULT_CATEGORIES] : []),
      patches: args.patchesRepo ? { repo: args.patchesRepo, ref: args.patchRef, sha: null } : null,
      skills: [],
    })
  } else if (args.repo) {
    const source = lock.sources.find((s) => s.repo === args.repo)
    if (!source) usage(`no sync source '${args.repo}' in upstream.lock.json`)
    targets.push(source)
  } else {
    targets.push(...lock.sources)
  }
  if (targets.length === 0) usage('no sync sources recorded; add one with --add-source')

  const work = mkdtempSync(join(tmpdir(), 'skills-sync-'))
  const oldTracked = new Set(lock.sources.flatMap((s) => s.skills))

  // Phase 1: resolve every target, download its tree, discover and patch its
  // skills — all before anything is installed, so a cross-source name
  // collision fails the run before it touches skills/.
  const results = new Map()
  const nameOwner = new Map()
  for (const source of targets) {
    let tag
    if (args.upstreamRef) tag = args.upstreamRef
    else if (args.latestTag) {
      tag = await latestReleaseTag(source.repo)
      console.log(`latest release tag on ${source.repo}: ${tag}`)
    } else if (source.ref) tag = source.ref
    else usage(`source ${source.repo} has no pinned tag; pass --upstream-ref or --latest-tag`)

    const sha = await resolveTag(source.repo, tag)
    console.log(`upstream ${source.repo}@${tag} -> ${sha.slice(0, 12)}`)
    const upstreamRoot = await downloadTarball(source.repo, tag, join(work, `${source.repo.replace('/', '-')}.tar.gz`))

    const categories = args.categories ?? source.categories ?? []
    const wanted = listSkillDirs(upstreamRoot, source.layout, categories)
    if (wanted.length === 0) throw new Error(`no SKILL.md found for ${source.repo} (layout ${source.layout}, categories: ${categories.join(' ') || 'none'})`)

    let patches = source.patches
    const patched = new Set()
    if (patches || args.patchesDir) {
      const patchRepo = patches?.repo
      const patchSha = await resolvePatchRef(patchRepo, args.patchRef)
      console.log(`patches ${patchRepo}@${args.patchRef} -> ${patchSha.slice(0, 12)}`)
      let patchesDir = args.patchesDir
      if (!patchesDir) {
        const patchRoot = await downloadTarball(patchRepo, args.patchRef, join(work, `${patchRepo.replace('/', '-')}.tar.gz`))
        patchesDir = join(patchRoot, 'patches')
      }
      if (!existsSync(patchesDir)) throw new Error(`no patches directory at ${patchesDir}`)
      // Patches may be nested (patches/<overlay>/<skill>.patch); walk
      // recursively and sort for deterministic application order.
      const patchFiles = []
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (entry.name.endsWith('.patch')) patchFiles.push(full)
        }
      }
      walk(patchesDir)
      for (const patchFile of patchFiles) {
        const outcome = await applyPatch(patchFile, upstreamRoot)
        const skill = basename(patchFile, '.patch')
        const name = basename(patchFile)
        if (outcome === 'applied') {
          patched.add(skill)
          console.log(`applied overlay patch: ${name}`)
        } else if (outcome === 'already') {
          patched.add(skill)
          console.log(`overlay patch already applied: ${name}`)
        } else {
          console.warn(`warning: overlay patch ${name} no longer applies to ${source.repo}@${tag}; that skill stays unpatched`)
        }
      }
      patches = { repo: patchRepo, ref: args.patchRef, sha: patchSha }
    }

    for (const skill of wanted) {
      const owner = nameOwner.get(skill.name)
      if (owner !== undefined && owner !== source.repo) {
        throw new Error(`skill name '${skill.name}' is claimed by both ${owner} and ${source.repo}; sync refuses to guess`)
      }
      nameOwner.set(skill.name, source.repo)
    }

    results.set(source.repo, { source, tag, sha, categories, wanted, patched, patches })
  }

  // Phase 2: install, then drop this source's stale entries. Untracked
  // directories (authored skills, other sources' output) are never replaced.
  let installedCount = 0
  for (const { source, wanted, patched } of results.values()) {
    const installed = []
    for (const skill of wanted) {
      const target = join(SKILLS_DIR, skill.name)
      if (existsSync(target) && !oldTracked.has(skill.name)) {
        console.warn(`warning: skills/${skill.name} already exists and is not lock-tracked; leaving it alone (skipped ${skill.name})`)
        continue
      }
      rmSync(target, { recursive: true, force: true })
      cpSync(skill.src, target, { recursive: true })
      const file = join(target, 'SKILL.md')
      const original = readFileSync(file, 'utf8')
      const folded = foldDescription(original, `skills/${skill.name}/SKILL.md`)
      if (folded !== original) {
        writeFileSync(file, folded)
        console.log(`folded multi-line description: ${skill.name}`)
      }
      installed.push(skill.name)
      installedCount++
      console.log(`installed: ${skill.name} (from ${source.repo}, ${patched.has(skill.name) ? 'patched' : 'unpatched'})`)
    }
    const wantedNames = new Set(wanted.map((s) => s.name))
    for (const name of source.skills ?? []) {
      if (!wantedNames.has(name)) {
        rmSync(join(SKILLS_DIR, name), { recursive: true, force: true })
        console.log(`removed: ${name} (no longer upstream/selected)`)
      }
    }
    results.get(source.repo).skills = installed
  }

  if (installedCount === 0) throw new Error('no skills were installed')

  const nextSources = [
    ...lock.sources.filter((s) => !results.has(s.repo)),
    ...[...results.values()].map(({ source, tag, sha, categories, patches, skills }) => ({
      repo: source.repo,
      ref: tag,
      sha,
      layout: source.layout,
      categories,
      patches,
      skills: skills.sort(),
    })),
  ].sort((a, b) => a.repo.localeCompare(b.repo))
  writeFileSync(LOCK_FILE, JSON.stringify({ sources: nextSources, syncedAt: new Date().toISOString() }, null, 2) + '\n')
  console.log(`\ndone: ${installedCount} skill(s) across ${results.size} source(s), ${[...results.values()].reduce((n, r) => n + r.patched.size, 0)} patch(es) applied, lock rewritten`)
}

main().catch((error) => {
  console.error(`error: ${error.message}`)
  process.exit(1)
})

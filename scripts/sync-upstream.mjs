// sync-upstream.mjs — pull Matt Pocock's skills into this bundle, patched for DSH.
//
// The bundle pins the latest upstream RELEASE TAG (never a branch or a bare
// commit). Every run: download the tagged upstream tarball, download the
// overlay patches from auggie246/dsh-mattpocock-skills, apply them to the
// downloaded tree, then flatten the chosen categories into skills/. Only
// names recorded in upstream.lock.json are ever replaced; anything else in
// skills/ (for example create-readme) is never touched. A stale patch is
// skipped with a warning, never a broken sync.
//
// Usage:
//   node scripts/sync-upstream.mjs                     re-sync at the locked tag
//   node scripts/sync-upstream.mjs --latest-tag        move to the newest release tag
//   node scripts/sync-upstream.mjs --upstream-ref v1.2.3   sync at an explicit tag
//   node scripts/sync-upstream.mjs --patch-ref <ref>   pin the patch source
//   node scripts/sync-upstream.mjs --patches <dir>     use local patches (offline)
//   node scripts/sync-upstream.mjs --categories "<list>"   default: engineering productivity

import { execFile } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, cpSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILLS_DIR = join(REPO_ROOT, 'skills')
const LOCK_FILE = join(REPO_ROOT, 'upstream.lock.json')

const UPSTREAM_REPO = 'mattpocock/skills'
const PATCH_REPO = 'auggie246/dsh-mattpocock-skills'
const DEFAULT_CATEGORIES = ['engineering', 'productivity']

function usage(message) {
  if (message) console.error(`error: ${message}`)
  console.error('usage: node scripts/sync-upstream.mjs [--latest-tag | --upstream-ref <tag>] [--patch-ref <ref>] [--patches <dir>] [--categories "<list>"]')
  process.exit(2)
}

function parseArgs(argv) {
  const args = { latestTag: false, upstreamRef: null, patchRef: 'HEAD', patchesDir: null, categories: null }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--latest-tag') args.latestTag = true
    else if (flag === '--upstream-ref') args.upstreamRef = argv[++i] ?? usage('--upstream-ref needs a tag')
    else if (flag === '--patch-ref') args.patchRef = argv[++i] ?? usage('--patch-ref needs a ref')
    else if (flag === '--patches') args.patchesDir = argv[++i] ?? usage('--patches needs a directory')
    else if (flag === '--categories') args.categories = (argv[++i] ?? usage('--categories needs a list')).split(/\s+/).filter(Boolean)
    else usage(`unknown flag: ${flag}`)
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

async function resolveTag(tag) {
  // Refuse non-tag refs: the pin policy is release tags only.
  try {
    await fetchJson(`https://api.github.com/repos/${UPSTREAM_REPO}/git/ref/tags/${encodeURIComponent(tag)}`)
  } catch {
    throw new Error(`${tag} is not a tag on ${UPSTREAM_REPO}; the bundle pins release tags only`)
  }
  // commits/<ref> dereferences an annotated tag to its commit sha.
  const commit = await fetchJson(`https://api.github.com/repos/${UPSTREAM_REPO}/commits/${encodeURIComponent(tag)}`)
  return commit.sha
}

async function resolvePatchRef(ref) {
  const commit = await fetchJson(`https://api.github.com/repos/${PATCH_REPO}/commits/${encodeURIComponent(ref)}`)
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

function listSkillDirs(root, categories) {
  // One flat pass: <root>/<category>/<skill>/SKILL.md, flattened by the caller.
  // A duplicate name across categories warns; the later category wins, matching
  // the upstream installer's manifest semantics.
  const pairs = new Map()
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const lock = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : null

  let tag
  if (args.upstreamRef) {
    tag = args.upstreamRef
  } else if (args.latestTag) {
    const release = await fetchJson(`https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest`)
    tag = release.tag_name
    console.log(`latest release tag: ${tag}`)
  } else if (lock?.upstream?.ref) {
    tag = lock.upstream.ref
    console.log(`re-syncing at locked tag: ${tag}`)
  } else {
    usage('no upstream.lock.json yet; pass --latest-tag or --upstream-ref <tag>')
  }

  const upstreamSha = await resolveTag(tag)
  const patchSha = await resolvePatchRef(args.patchRef)
  console.log(`upstream ${UPSTREAM_REPO}@${tag} -> ${upstreamSha.slice(0, 12)}`)
  console.log(`patches ${PATCH_REPO}@${args.patchRef} -> ${patchSha.slice(0, 12)}`)

  const work = mkdtempSync(join(tmpdir(), 'skills-sync-'))
  const upstreamRoot = await downloadTarball(UPSTREAM_REPO, tag, join(work, 'upstream.tar.gz'))
  let patchesDir = args.patchesDir
  if (!patchesDir) {
    const patchRoot = await downloadTarball(PATCH_REPO, args.patchRef, join(work, 'patches.tar.gz'))
    patchesDir = join(patchRoot, 'patches')
  }
  if (!existsSync(patchesDir)) throw new Error(`no patches directory at ${patchesDir}`)

  const categories = args.categories ?? lock?.categories ?? DEFAULT_CATEGORIES
  const wanted = listSkillDirs(upstreamRoot, categories)
  if (wanted.length === 0) throw new Error(`no SKILL.md found under categories: ${categories.join(' ')}`)

  // Patches may be nested (patches/<overlay>/<skill>.patch); walk recursively
  // and sort for deterministic application order.
  const patchFiles = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.patch')) patchFiles.push(full)
    }
  }
  walk(patchesDir)
  const patched = new Set()
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
      console.warn(`warning: overlay patch ${name} no longer applies to ${tag}; that skill stays unpatched`)
    }
  }

  const tracked = new Set(lock?.skills ?? [])
  const installed = []
  for (const skill of wanted) {
    const target = join(SKILLS_DIR, skill.name)
    if (existsSync(target) && !tracked.has(skill.name)) {
      console.warn(`warning: skills/${skill.name} already exists and is not lock-tracked; leaving it alone (skipped ${skill.name})`)
      continue
    }
    rmSync(target, { recursive: true, force: true })
    cpSync(skill.src, target, { recursive: true })
    installed.push(skill.name)
    console.log(`installed: ${skill.name} (from ${skill.category}, ${patched.has(skill.name) ? 'patched' : 'unpatched'})`)
  }

  // Remove previously synced entries that upstream no longer ships or that the
  // category list no longer selects.
  const wantedNames = new Set(wanted.map((s) => s.name))
  for (const name of tracked) {
    if (!wantedNames.has(name)) {
      const target = join(SKILLS_DIR, name)
      rmSync(target, { recursive: true, force: true })
      console.log(`removed: ${name} (no longer upstream/selected)`)
    }
  }

  if (installed.length === 0) throw new Error('no skills were installed')

  const nextLock = {
    upstream: { repo: UPSTREAM_REPO, ref: tag, sha: upstreamSha },
    patches: { repo: PATCH_REPO, ref: args.patchRef, sha: patchSha },
    categories,
    skills: installed.sort(),
    syncedAt: new Date().toISOString(),
  }
  writeFileSync(LOCK_FILE, JSON.stringify(nextLock, null, 2) + '\n')
  console.log(`\ndone: ${installed.length} skill(s) synced at ${tag}, ${patched.size} patch(es) applied, lock rewritten`)
}

main().catch((error) => {
  console.error(`error: ${error.message}`)
  process.exit(1)
})

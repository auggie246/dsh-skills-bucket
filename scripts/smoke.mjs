// Smoke test: run the plugin's apply() against a stub skills service and
// assert every bundled skill registers with parsed frontmatter and a body
// free of the frontmatter block.
import assert from 'node:assert'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply, resolvePonytailMode, applyPonytailDefault } from '../lib/index.js'

function fakeHost() {
  const registered = []
  const warnings = []
  const infos = []
  const ctx = {
    inject(services, fn) {
      assert.deepStrictEqual(services, ['skills'])
      fn({ skills: { register: (skill) => { registered.push(skill); return () => {} } } })
    },
    logger: {
      warn: (message) => warnings.push(message),
      info: (message) => infos.push(message),
    },
  }
  return { ctx, registered, warnings, infos }
}

// -- Ponytail default mode: resolution follows the upstream hook's order -----
const configDir = mkdtempSync(join(tmpdir(), 'ponytail-mode-'))
const configFile = join(configDir, 'config.json')
const missing = join(configDir, 'missing.json')

assert.strictEqual(resolvePonytailMode({ env: {}, configPath: missing }), 'full', 'no sources yields full')
assert.strictEqual(resolvePonytailMode({ env: { PONYTAIL_DEFAULT_MODE: 'lite' }, configPath: missing }), 'lite', 'env var resolves when no config file')
writeFileSync(configFile, '{ "defaultMode": "ultra" }\n')
assert.strictEqual(resolvePonytailMode({ env: {}, configPath: configFile }), 'ultra', 'config file resolves when no env var')
assert.strictEqual(resolvePonytailMode({ env: { PONYTAIL_DEFAULT_MODE: 'LITE' }, configPath: configFile }), 'lite', 'env var beats the config file, case-insensitive')
writeFileSync(configFile, '\uFEFF{ "defaultMode": "lite" }')
assert.strictEqual(resolvePonytailMode({ env: {}, configPath: configFile }), 'lite', 'a UTF-8 BOM is stripped')
writeFileSync(configFile, '{ "defaultMode": "review" }\n')
assert.strictEqual(resolvePonytailMode({ env: {}, configPath: configFile }), 'full', 'invalid values fall through to the default')
writeFileSync(configFile, 'not json')
assert.strictEqual(resolvePonytailMode({ env: {}, configPath: configFile }), 'full', 'invalid JSON falls through to the default')

// -- Ponytail default mode: the body rewrite moves both default markers ------
const fullBody = 'a. Default: **full**. b\n| **lite** | name the lazier alternative in one line. User picks. |\n| **full** | Shortest diff, shortest explanation. Default. |\n| **ultra** | challenge the rest of the requirement in the same breath. |'
assert.strictEqual(applyPonytailDefault(fullBody, 'full'), fullBody, 'full rewrites nothing')
assert.strictEqual(
  applyPonytailDefault(fullBody, 'lite'),
  'a. Default: **lite**. b\n| **lite** | name the lazier alternative in one line. User picks. Default. |\n| **full** | Shortest diff, shortest explanation. |\n| **ultra** | challenge the rest of the requirement in the same breath. |',
  'lite moves the default markers',
)
assert.ok(applyPonytailDefault(fullBody, 'ultra').includes('Default: **ultra**'), 'ultra rewrites the persistence line')
assert.strictEqual(applyPonytailDefault('drifted text', 'lite'), 'drifted text', 'missing markers no-op for the drift warning')

// -- Registration: every mode pins deterministically; nothing reads the host env
const pinned = fakeHost()
apply(pinned.ctx, { ponytailMode: 'full' })
const registered = pinned.registered
const warnings = pinned.warnings

const names = registered.map((skill) => skill.name)
assert.ok(names.length > 0, 'at least one skill registers')
assert.ok(names.includes('create-readme'), `create-readme registers (got: ${names.join(', ')})`)

for (const skill of registered) {
  assert.ok(skill.description.length > 0, `${skill.name} has a description`)
  assert.ok(!skill.description.startsWith("'"), `${skill.name} description has quotes stripped`)
  assert.ok(!skill.content.startsWith('---'), `${skill.name} body excludes the frontmatter block`)
  assert.deepStrictEqual(skill.resourceBase.kind, 'directory')
  assert.equal(skill.source, 'dsh-skills-bucket')
}

const createReadme = registered.find((skill) => skill.name === 'create-readme')
assert.ok(createReadme.content.includes('## Task'), 'create-readme body holds the task section')

// Synced snapshot: the lock's sources list what sync-upstream vendored; every
// locked skill must register, and a patched skill must carry the DSH note.
const lock = JSON.parse(readFileSync(new URL('../upstream.lock.json', import.meta.url), 'utf8'))
const sources = lock.sources ?? []
assert.ok(sources.length >= 2, `lock records at least two sync sources (got: ${sources.map((s) => s.repo).join(', ')})`)
const locked = sources.flatMap((source) => source.skills)
assert.ok(locked.length > 0, 'lock records synced skills')
for (const name of locked) {
  assert.ok(names.includes(name), `locked skill ${name} registers`)
}
assert.strictEqual(names.length, locked.length + 1, `exactly the lock plus create-readme registers (got ${names.length})`)
const grilling = registered.find((skill) => skill.name === 'grilling')
assert.ok(grilling.content.includes('DSH note: asking the user'), 'grilling carries the DSH ask-user note')

// Ponytail source: the upstream ships multi-line YAML block-scalar
// descriptions; the sync must have folded them into single lines so the
// frontmatter parser reads a real trigger instead of '>'.
const ponytail = registered.find((skill) => skill.name === 'ponytail')
assert.ok(ponytail !== undefined, 'ponytail registers')
assert.ok(!ponytail.description.startsWith('>'), 'ponytail description is not the unfolded block scalar')
assert.ok(ponytail.description.length > 20, 'ponytail description is a real folded trigger')
assert.ok(ponytail.description.includes('lazy'), 'ponytail description keeps the lazy trigger words')
assert.ok(ponytail.content.includes('Default: **full**'), 'a full default registers the body verbatim')
for (const name of ['ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review']) {
  assert.ok(names.includes(name), `ponytail skill ${name} registers`)
}

// -- Registration: a lite default is baked into the ponytail body -------------
const lite = fakeHost()
apply(lite.ctx, { ponytailMode: 'lite' })
const liteSkill = lite.registered.find((skill) => skill.name === 'ponytail')
assert.ok(liteSkill !== undefined, 'lite keeps the ponytail skill registered')
assert.ok(liteSkill.content.includes('Default: **lite**'), 'lite default lands in the persistence line')
assert.ok(!liteSkill.content.includes('Default: **full**'), 'the full default is gone')
assert.ok(liteSkill.content.includes('User picks. Default. |'), 'the lite row carries the default marker')
assert.ok(!liteSkill.content.includes('explanation. Default. |'), 'the full row lost its default marker')
assert.strictEqual(liteSkill.description, ponytail.description, 'the description is untouched by the mode')
assert.deepStrictEqual(lite.warnings, [], 'no drift warnings on the vendored text')

// -- Registration: an ultra default lands the same way ------------------------
const ultra = fakeHost()
apply(ultra.ctx, { ponytailMode: 'ultra' })
const ultraSkill = ultra.registered.find((skill) => skill.name === 'ponytail')
assert.ok(ultraSkill.content.includes('Default: **ultra**'), 'ultra default lands in the persistence line')
assert.ok(ultraSkill.content.includes('same breath. Default. |'), 'the ultra row carries the default marker')

// -- Registration: off removes the mode skill, one-shots stay ------------------
const off = fakeHost()
apply(off.ctx, { ponytailMode: 'off' })
const offNames = off.registered.map((skill) => skill.name)
assert.ok(!offNames.includes('ponytail'), 'off does not register the ponytail mode skill')
assert.ok(offNames.includes('ponytail-help'), 'off keeps the one-shot ponytail skills')
assert.strictEqual(offNames.length, names.length - 1, 'off registers exactly one skill fewer')

// -- apply() refuses a mode outside the runtime levels -------------------------
assert.throws(() => apply(fakeHost().ctx, { ponytailMode: 'review' }), /ponytailMode must be one of/, 'review is never a default')

assert.deepStrictEqual(warnings, [], `no warnings during registration (got: ${warnings.join(' | ')})`)
console.log(`ok: registered ${names.join(', ')}`)

// Smoke test: run the plugin's apply() against a stub skills service and
// assert every bundled skill registers with parsed frontmatter and a body
// free of the frontmatter block.
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

import { apply } from '../lib/index.js'

const registered = []
const warnings = []
const fakeCtx = {
  inject(services, fn) {
    assert.deepStrictEqual(services, ['skills'])
    fn({ skills: { register: (skill) => { registered.push(skill); return () => {} } } })
  },
  logger: { warn: (message) => warnings.push(message) },
}

apply(fakeCtx)

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
for (const name of ['ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review']) {
  assert.ok(names.includes(name), `ponytail skill ${name} registers`)
}

assert.deepStrictEqual(warnings, [], `no warnings during registration (got: ${warnings.join(' | ')})`)
console.log(`ok: registered ${names.join(', ')}`)

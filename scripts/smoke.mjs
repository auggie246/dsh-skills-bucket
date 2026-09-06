// Smoke test: run the plugin's apply() against a stub skills service and
// assert every bundled skill registers with parsed frontmatter and a body
// free of the frontmatter block.
import assert from 'node:assert'

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

assert.deepStrictEqual(warnings, [], `no warnings during registration (got: ${warnings.join(' | ')})`)
console.log(`ok: registered ${names.join(', ')}`)

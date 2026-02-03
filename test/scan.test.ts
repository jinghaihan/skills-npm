import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { scanNodeModules } from '../src/scan.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const fixturePath = join(__dirname, 'fixtures', 'nested-dependencies')

describe('scanNodeModules', () => {
  describe('depth option', () => {
    it('depth 1 - only scans first-level packages', async () => {
      const result = await scanNodeModules({
        cwd: fixturePath,
        depth: 1,
      })

      expect(result.packageCount).toBe(3)
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].packageName).toBe('direct-package-with-skill')
      expect(result.skills[0].skillName).toBe('test-skill')
    })

    it('depth 2 - scans nested dependencies', async () => {
      const result = await scanNodeModules({
        cwd: fixturePath,
        depth: 2,
      })

      expect(result.packageCount).toBe(4)
      expect(result.skills).toHaveLength(2)

      const skillNames = result.skills.map(s => s.skillName).sort()
      expect(skillNames).toEqual(['nested-skill', 'test-skill'])

      const nestedSkill = result.skills.find(s => s.skillName === 'nested-skill')
      expect(nestedSkill?.packageName).toBe('nested-package-with-skill')
    })

    it('depth undefined - defaults to 1', async () => {
      const result = await scanNodeModules({
        cwd: fixturePath,
      })

      expect(result.packageCount).toBe(3)
      expect(result.skills).toHaveLength(1)
    })

    it('depth 3 - handles deeper nesting gracefully', async () => {
      const result = await scanNodeModules({
        cwd: fixturePath,
        depth: 3,
      })

      // Same as depth 2 since we only have 2 levels in fixtures
      expect(result.packageCount).toBe(4)
      expect(result.skills).toHaveLength(2)
    })
  })

  describe('package counting', () => {
    it('counts all packages including those without skills', async () => {
      const result = await scanNodeModules({
        cwd: fixturePath,
        depth: 1,
      })

      // 3 first-level packages
      expect(result.packageCount).toBe(3)
    })

    it('counts packages at all levels with depth > 1', async () => {
      const result = await scanNodeModules({
        cwd: fixturePath,
        depth: 2,
      })

      // 3 first-level + 1 nested
      expect(result.packageCount).toBe(4)
    })
  })
})

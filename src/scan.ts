import type { ExcludeItem, InvalidSkill, NpmSkill, ScanOptions, ScanResult } from './types.ts'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { createTargetName, hasValidSkillMd, isDirectoryOrSymlink, searchForWorkspaceRoot } from './utils/index'

/**
 * Scan node_modules for packages that contain skills
 */
export async function scanNodeModules(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd || searchForWorkspaceRoot(process.cwd())
  const maxDepth = options.depth ?? 1
  const nodeModulesPath = join(cwd, 'node_modules')
  const allSkills: NpmSkill[] = []
  const allInvalidSkills: InvalidSkill[] = []
  let packageCount = 0

  /**
   * Recursively scan a node_modules directory
   */
  async function scanDirectory(currentPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth)
      return

    try {
      const entries = await readdir(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        // Check for directory or symlink (pnpm uses symlinks)
        if (!isDirectoryOrSymlink(entry))
          continue

        // Skip hidden directories and common non-package directories
        if (entry.name.startsWith('.'))
          continue

        // Handle scoped packages (@org/package)
        if (entry.name.startsWith('@')) {
          const scopePath = join(currentPath, entry.name)
          try {
            const scopedEntries = await readdir(scopePath, { withFileTypes: true })
            for (const scopedEntry of scopedEntries) {
              if (!isDirectoryOrSymlink(scopedEntry))
                continue
              packageCount++
              const fullPackageName = `${entry.name}/${scopedEntry.name}`
              const packagePath = join(scopePath, scopedEntry.name)

              // Check for skills in this package
              const { skills, invalidSkills } = await scanPackageForSkills(packagePath, fullPackageName)
              allSkills.push(...skills)
              allInvalidSkills.push(...invalidSkills)

              // Recursively scan nested node_modules
              const nestedNodeModules = join(packagePath, 'node_modules')
              await scanDirectory(nestedNodeModules, currentDepth + 1)
            }
          }
          catch {
            // Scope directory not readable
          }
        }
        else {
          packageCount++
          const packagePath = join(currentPath, entry.name)

          // Check for skills in this package
          const { skills, invalidSkills } = await scanPackageForSkills(packagePath, entry.name)
          allSkills.push(...skills)
          allInvalidSkills.push(...invalidSkills)

          // Recursively scan nested node_modules
          const nestedNodeModules = join(packagePath, 'node_modules')
          await scanDirectory(nestedNodeModules, currentDepth + 1)
        }
      }
    }
    catch {
      // The directory doesn't exist or isn't readable
    }
  }

  await scanDirectory(nodeModulesPath, 1)

  return { skills: allSkills, invalidSkills: allInvalidSkills, packageCount }
}

export async function scanPackageForSkills(packagePath: string, packageName: string): Promise<{ skills: NpmSkill[], invalidSkills: InvalidSkill[] }> {
  const skills: NpmSkill[] = []
  const invalidSkills: InvalidSkill[] = []
  const skillsDir = join(packagePath, 'skills')

  try {
    const skillsDirStats = await stat(skillsDir)
    if (!skillsDirStats.isDirectory())
      return { skills, invalidSkills }

    const entries = await readdir(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory())
        continue

      const skillPath = join(skillsDir, entry.name)
      const skillInfo = await hasValidSkillMd(skillPath)

      if (skillInfo.valid) {
        skills.push({
          packageName,
          skillName: entry.name,
          skillPath,
          targetName: createTargetName(packageName, entry.name),
          name: skillInfo.name!,
          description: skillInfo.description!,
        })
      }
      else {
        invalidSkills.push({
          packageName,
          skillName: entry.name,
          error: skillInfo.error || 'unknown_error',
        })
      }
    }
  }
  catch {
    // The skills/ directory doesn't exist or isn't readable
  }

  return { skills, invalidSkills }
}

/**
 * Filter out skills that should be excluded based on the exclude config
 */
export function filterExcludedSkills(skills: NpmSkill[], exclude: ExcludeItem[] | undefined): NpmSkill[] {
  if (!exclude || exclude.length === 0)
    return skills

  return skills.filter((skill) => {
    for (const item of exclude) {
      if (typeof item === 'string') {
        // Exclude all skills from this package
        if (skill.packageName === item)
          return false
      }
      else {
        // Exclude specific skills from this package
        if (skill.packageName === item.package && item.skills.includes(skill.skillName))
          return false
      }
    }
    return true
  })
}

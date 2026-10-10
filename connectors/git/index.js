import { createHash } from 'node:crypto'

export default function createConnector(context) {
  return {
    name: 'git',
    async detect(_pkg, config) {
      const repository = config.repository
      if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
        throw new Error('git connector requires config.repository in owner/name form')
      }

      const response = await context.fetch(`https://api.github.com/repos/${repository}/tags?per_page=100`, {
        headers: { accept: 'application/vnd.github+json' }
      })
      if (!response.ok) {
        throw new Error(`GitHub tags request failed for ${repository}: ${response.status} ${response.statusText}`)
      }

      const tags = await response.json()
      if (!Array.isArray(tags)) throw new Error(`GitHub tags response for ${repository} is invalid`)
      const candidates = tags
        .map(tag => ({ name: tag.name, version: typeof tag.name === 'string' ? tag.name.replace(/^v(?=\d)/, '') : '' }))
        .filter(tag => /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag.version))
        .sort((a, b) => compareVersions(b.version, a.version))
      const latest = candidates[0]
      if (!latest) throw new Error(`No semantic version tags found for ${repository}`)

      const source = `https://github.com/${repository}/archive/refs/tags/${latest.name}.tar.gz`
      const archive = await context.fetch(source)
      if (!archive.ok) throw new Error(`Git source download failed for ${repository}@${latest.name}: ${archive.status} ${archive.statusText}`)
      const sha256 = createHash('sha256').update(new Uint8Array(await archive.arrayBuffer())).digest('hex')
      return { version: latest.version, source, sha256, metadata: { repository, tag: latest.name } }
    }
  }
}

function compareVersions(left, right) {
  const a = left.split(/[.+-]/).map(part => /^\d+$/.test(part) ? Number(part) : part)
  const b = right.split(/[.+-]/).map(part => /^\d+$/.test(part) ? Number(part) : part)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x - y
    return String(x).localeCompare(String(y))
  }
  return 0
}

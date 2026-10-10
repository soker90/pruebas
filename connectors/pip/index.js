import { createHash } from 'node:crypto'

export default function createConnector(context) {
  return {
    name: 'pip',
    async detect(_pkg, config) {
      const packageName = config.package
      if (typeof packageName !== 'string' || !/^[A-Za-z0-9._-]+$/.test(packageName)) {
        throw new Error('pip connector requires config.package to be a PyPI project name')
      }

      const response = await context.fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`)
      if (!response.ok) {
        throw new Error(`PyPI request failed for ${packageName}: ${response.status} ${response.statusText}`)
      }

      const metadata = await response.json()
      const version = metadata?.info?.version
      const releases = metadata?.releases?.[version]
      if (typeof version !== 'string' || !Array.isArray(releases)) {
        throw new Error(`PyPI metadata for ${packageName} has no current release files`)
      }

      const sourceFile = releases.find(file => file.packagetype === 'sdist' && typeof file.url === 'string')
      if (!sourceFile) {
        throw new Error(`PyPI release ${packageName}@${version} has no source distribution`)
      }

      let sha256 = sourceFile.digests?.sha256
      if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) {
        const archive = await context.fetch(sourceFile.url)
        if (!archive.ok) {
          throw new Error(`PyPI source download failed: ${archive.status} ${archive.statusText}`)
        }
        sha256 = createHash('sha256').update(new Uint8Array(await archive.arrayBuffer())).digest('hex')
      }

      return { version, source: sourceFile.url, sha256, metadata: { package: packageName, registry: 'pypi' } }
    }
  }
}

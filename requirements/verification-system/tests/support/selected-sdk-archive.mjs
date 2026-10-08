import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export function copySelectedSdkArchive(targetArchivePath, env = process.env) {
  const archivePath = env.WXS_VERIFICATION_READONLY_SDK_ARCHIVE
  const archiveSha256 = env.WXS_VERIFICATION_READONLY_SDK_ARCHIVE_SHA256
  if (archivePath === undefined && archiveSha256 === undefined) return null
  assert.ok(typeof archivePath === 'string' && path.isAbsolute(archivePath), 'SDK archive selection requires an explicit absolute path')
  assert.match(archiveSha256 ?? '', /^[0-9a-f]{64}$/, 'SDK archive selection requires the declared raw SHA256')
  assert.ok(fs.lstatSync(archivePath).isFile(), 'The selected SDK archive must be a regular file')
  fs.copyFileSync(archivePath, targetArchivePath, fs.constants.COPYFILE_EXCL)
  return archiveSha256
}

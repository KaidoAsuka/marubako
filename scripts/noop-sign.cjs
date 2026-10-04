// electron-builder's custom signing hook (see win.signtoolOptions.sign in electron-builder.config.cjs).
//
// The first releases are NOT code-signed, on purpose. The hook is kept so that electron-builder
// still edits the executable (icon, version information) without looking for a certificate, and it
// does nothing else. It says so in the build log for every file it is asked about, so that nobody
// reading the log takes the installer for a signed one.
//
// Windows SmartScreen warns about an unsigned installer; that is expected for these releases.
module.exports = async function noopSign(configuration) {
  const target =
    configuration && configuration.path ? configuration.path : 'a file'
  console.warn(
    `  • UNSIGNED BUILD: ${target} is not code-signed (no certificate is used)`
  )
  return true
}

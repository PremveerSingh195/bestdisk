const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
    // electron-builder packs intermediate x64 and arm64 staging bundles to -temp folders.
    // Signing those creates arch-specific CodeResources files that break @electron/universal merge.
    // We only sign the final output bundle.
    if (context.appOutDir.includes('-temp')) {
        return
    }

    const appName = context.packager.appInfo.productFilename
    const appPath = path.join(context.appOutDir, `${appName}.app`)

    console.log(`\nAd-hoc signing: ${appPath}`)
    execSync(`codesign --force --deep --sign - "${appPath}"`)
    console.log('Done ✓\n')
}
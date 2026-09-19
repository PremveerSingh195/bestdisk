const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
    // When building a universal app, electron-builder first packs x64 and arm64 into temporary folders (-temp).
    // Signing those intermediate bundles generates architecture-specific CodeResources files that cause
    // @electron/universal SHA comparison checks to fail.
    // Only sign the final output bundle (not the intermediate -temp folders).
    if (context.appOutDir.includes('-temp')) {
        return
    }

    const appName = context.packager.appInfo.productFilename
    const appPath = path.join(context.appOutDir, `${appName}.app`)

    console.log(`\nAd-hoc signing: ${appPath}`)
    execSync(`codesign --force --deep --sign - "${appPath}"`)
    console.log('Ad-hoc signing complete ✓\n')
}
/**
 * @type {import('@react-native-community/cli-types').UserDependencyConfig}
 */
module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.esctscprinter.EscTscPrinterPackage;',
      },
      ios: {},
    },
  },
};

const { withSettingsGradle } = require('expo/config-plugins');

// Gradle rejects project names that start or end with '.', so "kakie." can't be rootProject.name.
module.exports = function withGradleName(config, name) {
  return withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(/rootProject\.name\s*=\s*(['"]).*?\1/, `rootProject.name = '${name}'`);
    return cfg;
  });
};

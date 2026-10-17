
process.argv.splice(2, 0, 'program.json');
process.chdir(require('path').join(__dirname, 'programs', 'server'));
require("./programs/server/runtime.js")({ cachePath: process.env.METEOR_REIFY_CACHE_DIR });
require('./programs/server/boot.js');
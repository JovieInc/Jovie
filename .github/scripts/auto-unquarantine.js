#!/usr/bin/env node
// Historical entry point, canonical ledger and verified execution evidence.
// Missing Markdown rows never prove success.
const { processQuarantine } = require('./update-quarantine.js');
if (require.main === module) {
  try {
    console.log(JSON.stringify(processQuarantine()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { processQuarantine };

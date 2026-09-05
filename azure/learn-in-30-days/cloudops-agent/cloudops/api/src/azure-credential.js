const { ManagedIdentityCredential } = require("@azure/identity");

const credential = new ManagedIdentityCredential();

module.exports = { credential };

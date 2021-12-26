const mongoose = require('mongoose');

const hostingProviderSchema = {
    providerName: {
        type: String,
        required: true
    },
    providerHost: {
        type: String,
        required: true
    },
    providerPort: {
        type: String,
        required: true
    }
}

const HostingProvider = mongoose.model('HostingProvider', hostingProviderSchema)

module.exports = HostingProvider
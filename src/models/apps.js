const mongoose = require('mongoose');

const appSchema = {
    appId: {
        type: String,
        required: true
    },
    appName: {
        type: String,
        required: true
    },
    repoName: {
        type: String,
        required: true
    },
    branch: {
        type: String,
        required: true
    },
    pathPrefix: {
        type: String,
        required: true
    },
    hostingProvider: {
        type: String,
        required: true
    },
    gitUsername: {
        type: String,
        required: true
    },
    gitPassword: {
        type: String,
        required: true
    },
    gitToken: {
        type: String,
        required: true
    },
    ftpUsername: {
        type: String,
        required: true
    },
    ftpPassword: {
        type: String,
        required: true
    },
    requestToken: {
        type: String,
        required: true
    },
    passphrase: {
        type: String,
        required: true
    }
}

const App = mongoose.model('App', appSchema)

module.exports = App
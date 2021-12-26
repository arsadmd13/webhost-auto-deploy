const mongoose = require('mongoose');

const scheduleSchema = {
    appId: {
        type: String,
        required: true
    },
    payload: {
        type: String,
        required: true
    },
    scheduleTime: {
        type: String,
        required: true
    },
    status: {
        type: Number,
        required: true
    }
}

const Schedule = mongoose.model('Schedule', scheduleSchema)

module.exports = Schedule
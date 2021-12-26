const Repository = require('github-api/dist/components/Repository');

const Client = require('ftp');
const fs = require('fs');
const path = require('path');
const client = new Client();
const request = require("request");
const HostingProvider = require('../models/hostingProvider');
const Schedule = require('../models/schedules');

exports.notify = async (req, res) => {
    try {
        let payload = req.body;

        if(req.headers['x-github-event'] === "push" && getBranchFromRefId(payload.ref) === res.locals.branch) {
            const date = new Date();
            date.setMinutes(date.getMinutes() + 1);
            date.setSeconds(0);
            date.setMilliseconds(0);

            let commits = [];

            payload.commits.forEach((commit) => {
                commits.push(commit.id);
            })

            const newSchedule = new Schedule({
                appId: res.locals.appId,
                scheduleTime: date.getTime(),
                payload: JSON.stringify({
                    repoFullName: payload.repository.full_name,
                    before: payload.before,
                    after: payload.after,
                    commits
                }),
                status: 0
            }).save((err) => {
                if(err) return res.sendStatus(500)
                res.sendStatus(200);
            })

        } else {
            console.log("Unsupported event/branch!");
            return res.sendStatus(201);
        }
    } catch(err) {
        console.log(err)
        return res.sendStatus(500);
    }
}



function getBranchFromRefId(ref) {
    return String(ref).split('/')[2];
}
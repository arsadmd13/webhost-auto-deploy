const Repository = require('github-api/dist/components/Repository');

const Client = require('ftp');
const fs = require('fs');
const path = require('path');
const client = new Client();
const request = require("request");
const HostingProvider = require('../models/hostingProvider');

exports.notify = async (req, res) => {
    try {
        let payload = req.body;
        if(req.headers['x-github-event'] === "push" && getBranchFromRefId(payload.ref) !== res.locals.branch) {

            const repo = new Repository(res.locals.repoName, {
                username: res.locals.gitUsername,
                password: res.locals.gitPassword
            });

            repo.compareBranches(payload.before, payload.after, async (err, result) => {
                if(err) {
                    throw new Error('Unable to get newly updated files!');
                } else {
                    await getRemoteServerDetails(res.locals.hostingProvider)
                        .then((data) => {
                            if(data.status === 200) {
                                client.connect({
                                    host: data.record.providerHost,
                                    port: data.record.providerPort,
                                    user: res.locals.ftpUsername,
                                    password: res.locals.ftpPassword
                                });
                                client.on('ready', async () => {
                                    await intiDataTransfer(payload, result.files)
                                        .then(() => {
                                            client.end();
                                            return res.sendStatus(200);
                                        })
                                        .catch((err) => {
                                            throw new Error(err);
                                        })
                                })
                            } else {
                                return res.sendStatus(404);
                            }
                        }).catch((err) => {
                            throw new Error('Failed to fetch hosting provider details!');
                        })
                }
            })
        } else {
            console.log("Unsupported event/branch!");
            return res.sendStatus(201);
        }
    } catch(err) {
        return res.sendStatus(500);
    }
}

function intiDataTransfer(payload, files) {
    return Promise.all(Array(files).map(async (updatedFile) => {
        try {
            let prevFolders = [];
            let file = fs.createWriteStream(path.resolve(`src/temp/staging_area/${generateRandomFileName()}`));
            let requireFolderCheck = false;
            let gitFilePath;
            if(nameContainsPaths(updatedFile.filename)) {
                gitFilePath = updatedFile.filename.split('/');
                gitFilePath.pop();
                if(!prevFolders.includes(gitFilePath.join('/'))) {
                    requireFolderCheck = true;
                    prevFolders.push(gitFilePath.join('/'))
                }
            }
            await new Promise((resolve, reject) => {
                request(getRawUrl(payload.repository.full_name, payload.after, updatedFile.filename))
                    .on('error', function (err) {
                        reject("Failed to fetch file from git!")
                    })
                    .pipe(file)
                    .on('finish', async () => {
                        await uploadFileToServer(file.path, updatedFile.filename, requireFolderCheck);
                        resolve();
                    })
            })
        } catch (err) {
            throw new Error(err)
        }
    }))
}

function getRemoteServerDetails(providerId) {
    return new Promise((resolve, reject) => {
        HostingProvider.findOne({providerId}, async (err, record) => {
            if(err) {
                reject(err)
            } else if(record) {
                resolve({status: 200, record});
            } else {
                resolve({status: 200})
            }
        })
    })
}

async function uploadFileToServer(file, originalName, requireFolderCheck) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, {encoding: 'utf-8'}, async (resu, err) => {
            if(requireFolderCheck) {
                await createFolder(originalName);
            }
            await client.put(err, originalName, (err) => {
                fs.unlink(file, (err) => {
                    if(err) {
                        reject(err)
                    }
                })
                if(!err) {
                    resolve();
                } else {
                    reject('Unable to upload file to server!')
                }
            })
        })
    })
}

function nameContainsPaths(fullFilename) {
    return String(fullFilename).split('/').length > 1 ? true : false;
}

async function createFolder(fullFilename) {
    let folders = fullFilename.split('/');
    folders.pop();
    await client.mkdir(folders.join('/'), true, (err) => {
        if(!err) {
            console.log("Folders Created!");
        } else {
            throw new Error('Unable to create the required folder!');
        }
        return
    })
}

function getBranchFromRefId(ref) {
    return String(ref).split('/')[2];
}

function getRawUrl(fullRepoName, commitRef, fileName) {
    return `https://raw.githubusercontent.com/${fullRepoName}/${commitRef}/${fileName}`;
}

function generateRandomFileName() {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for ( var i = 0; i < 20; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
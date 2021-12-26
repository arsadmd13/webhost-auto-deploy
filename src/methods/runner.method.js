const App = require("../models/apps");
const Schedule = require("../models/schedules")
const Repository = require('github-api/dist/components/Repository');

const Client = require('ftp');
const fs = require('fs');
const path = require('path');
const request = require("request");
const HostingProvider = require('../models/hostingProvider');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.fetchScheduleData = async () => {
    const date = new Date();
    date.setSeconds(0);
    date.setMilliseconds(0);
    let time = date.getTime();

    Schedule.find({scheduleTime: time.toString(), status: 0}, (err, docs) => {
        if(err) {
            console.log(err)
        } else if(docs.length === 0) {
            console.log("No data");
        } else {
            docs.forEach((doc) => {
                doWork(doc)
            })
        }
    })
}

const doWork = async (data) => {
    App.findOne({appId: data.appId}, {gitUsername: 0, gitPassword: 0, requestToken: 0, passphrase: 0}, (err, appData) => {
        
        if(err) {
            return res.sendStatus(500);
        } else if(!appData) {
            return res.sendStatus(404);
        }

        const payload = JSON.parse(data.payload)

        payload.commits.forEach((commit) => {
            getCommitDetails(appData, payload, commit, null, cb)
        })
    })
}

async function getCommitDetails(appData, payload, commitId, url, callback) {
    const tempClient = new Client();

    url = !url ? `https://api.github.com/repos/${payload.repoFullName}/commits/${commitId}` : url;

    callback(null, `Requesting commit details from ${url}. Found ${result.files.length} files`, appData)
    await fetch(url, {
        method: 'GET',
        headers: {'Authorization': `token ${appData.gitToken}`}
    }).then(async (response) => {
        let result = await response.json()
        callback(null, `Received response for commit details from ${url}. Found ${result.files.length} files`, appData)
        await getRemoteServerDetails(appData.hostingProvider)
                    .then((hostingData) => {
                        if(hostingData.status === 200) {
                            callback(null, `Fetched remote server data`, appData)
                            tempClient.connect({
                                host: hostingData.appData.providerHost,
                                port: hostingData.appData.providerPort,
                                user: appData.ftpUsername,
                                password: appData.ftpPassword
                            });
                            tempClient.on('ready', async () => {
                                callback(null, `Remote server connection successfull`, appData)
                                await initDataTransfer(payload, result.files, appData, tempClient, cb)
                                    .then(() => {
                                        tempClient.end();
                                        callback(null, `Completed file sync from ${url}.\nEnding connection.\nChecking for further files in this commit...`, appData)
                                        let nextPageLink = scrapNextPageLink(response.headers);
                                        if(nextPageLink) {
                                            callback(null, `More files available from ${nextPageLink}`, appData)
                                            getCommitDetails(appData, payload, commitId, nextPageLink, cb)
                                        } else {
                                            callback(null, `File sync complete`, appData)
                                        }
                                        callback(null, `Transfer Complete`, appData)
                                    })
                                    .catch((err) => {
                                        callback({
                                            message: "Error Occured",
                                            error: err
                                        }, null, appData)
                                    })
                            })
                            tempClient.on('end', async() => {
                                callback(null, `Remote FTP Connection Ended.`, appData)
                            })
                            tempClient.on('error', (err) => {
                                callback({
                                    message: "Remote FTP Connection Error",
                                    error: err
                                }, null, appData)
                            })
                        } else {
                            callback(null, `Unable to fetch hosting provider data.`, appData)
                        }
                    }).catch((err) => {
                        callback({
                            message: "Failed to fetch hosting provider details!",
                            error: err
                        }, null, appData)
                    })
    }).catch((error) => {
        tempClient.end();
        callback({
            message: "Unknown Error. Ending Remote FTP Connection.",
            error: error
        }, null, appData)
    })
}

async function initDataTransfer(payload, files, appData, client, callback) {
    callback(null, `Initializing File Upload...`, appData)
    return new Promise(async (resolve, reject) => {
        let prevFolders = [];
        for await (const updatedFile of files) {
            try {
                callback(null, `File --> ${updatedFile.filename}`, appData)
                let fileFullName = path.join(appData.pathPrefix || '', updatedFile.filename)
                let file = fs.createWriteStream(path.resolve(`src/temp/staging_area/${generateRandomFileName()}`));
                callback(null, `Temp File Created --> ${file.path}`, appData)

                let requireFolderCheck = false;
                let gitFilePath;
                if(nameContainsPaths(fileFullName)) {
                    gitFilePath = fileFullName.split('/');
                    gitFilePath.pop();
                    if(!prevFolders.includes(gitFilePath.join('/'))) {
                        requireFolderCheck = true;
                        prevFolders.push(gitFilePath.join('/'))
                    }
                }

                await new Promise((resolve, reject) => {
                    callback(null, `Requesting File --> ${updatedFile.filename}`, appData)
                    request(getRawUrl(payload.repoFullName, payload.after, updatedFile.filename))
                        .on('error', function (err) {
                            callback({
                                message: "Failed to fetch file from git!",
                                error: err
                            }, null, appData)
                            reject("Failed to fetch file from git!")
                        })
                        .pipe(file)
                        .on('finish', async () => {
                            callback(null, `Received File --> ${updatedFile.filename}, Stored as ${file.path}.\nInitializing Upload to ${fileFullName}`, appData)
                            await uploadFileToServer(file.path, fileFullName, requireFolderCheck, appData, client, callback);
                            resolve();
                        })
                })
            } catch (err) {
                callback({
                    message: "Unknown error occurred!",
                    error: err
                }, null, appData)
                reject(err)
            }
        }
        resolve()
    })
}

async function uploadFileToServer(file, originalName, requireFolderCheck, appData, client, callback) {
    return new Promise((resolve, reject) => {
        try {
            callback(null, `Reading File --> ${file.path}`, appData)
            fs.readFile(file, {encoding: 'utf-8'}, async (err, fileData) => {
                if(err) {
                    callback({
                        message: `Unable to Read File --> ${file.path}`,
                        error: err
                    }, null, appData)
                    reject("Unable to read file");
                }
                if(requireFolderCheck) {
                    callback(null, `Initializing Folder Check --> ${originalName}`, appData)
                    await createFolder(originalName, appData, client, callback);
                }
                callback(null, `Uploading --> ${file.path} --> ${originalName}`, appData)
                client.put(fileData, originalName, (err) => {
                    fs.unlink(file, (err) => {
                        if(err) {
                            callback({
                                message: `Unable to Remove File --> ${file.path}`,
                                error: err
                            }, null, appData)
                            reject(err)
                        }
                    })
                    if(!err) {
                        callback(null, `Uploaded --> ${file.path} --> ${originalName}\n\n------\n`, appData)
                        resolve();
                    } else {
                        callback({
                            message: `Unable to Upload File --> ${file.path} --> ${originalName}`,
                            error: err
                        }, null, appData)
                        reject('Unable to upload file to server!')
                    }
                })
            })
        } catch (err) {
            callback({
                message: `Unable to Upload File --> ${file.path} --> ${originalName}`,
                error: err
            }, null, appData)
            reject(err)
        }
    })
}

async function createFolder(fullFilename, appData, client, callback) {
    let folders = fullFilename.split('/');
    folders.pop();
    await client.mkdir(folders.join('/'), true, (err) => {
        if(!err) {
            callback(null, `Folder(s) Created! --> ${folders.join('/')}`, appData)
        } else {
            callback({
                message: `Unable to create the required folder(s) --> ${folders.join('/')}`,
                error: err
            }, null, appData)
            throw new Error('Unable to create the required folder(s)!');
        }
        return
    })
}

function getRemoteServerDetails(providerId) {
    return new Promise((resolve, reject) => {
        HostingProvider.findOne({providerId}, async (err, appData) => {
            if(err) {
                reject(err)
            } else if(appData) {
                resolve({status: 200, appData});
            } else {
                resolve({status: 200})
            }
        })
    })
}

function nameContainsPaths(fullFilename) {
    return String(fullFilename).split('/').length > 1 ? true : false;
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

function scrapNextPageLink(headers) {
    if(headers.has('link')) {
        let linkHeader = headers.get('link');
        let unsanitizedLinks = linkHeader.split(',');
        for(let i = 0; i < unsanitizedLinks.length; i++) {
            if(unsanitizedLinks[i].includes('rel="next"')) {
                return unsanitizedLinks[i].match(/<(.*?)>/)[1];
            }  
        }
    }
    return false;
}

function cb(error, response, appData) {
    if(error) {
        console.log(error.message, error.error)
    } else {
        console.log(response)
    }
}
  
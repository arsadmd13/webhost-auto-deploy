const App = require('../models/apps');
const crypto = require('crypto')

module.exports = (req, res, next) => {
    let requestToken = req.params.requestToken;
    App.findOne({requestToken}, (err, record) => {
        if(err) {
            res.sendStatus(500);
        } else if(record) {
            const sig = req.headers['x-hub-signature-256'];
            if (!verify(sig, record.passphrase, JSON.stringify(req.body))) {
                res.sendStatus(403);
            } else {
                res.locals = record;
                next();
            }
        } else {
            res.sendStatus(404);
        }
    })
}

function sign(passphrase, data) {
    return `sha256=${crypto.createHmac('sha256', passphrase).update(data).digest('hex')}`
}

function verify (signature, passphrase, data) {
    const signatureBuf = Buffer.from(signature)
    const signedStr = Buffer.from(sign(passphrase, data))
    if (signatureBuf.length !== signedStr.length) {
      return false
    }
    return crypto.timingSafeEqual(signatureBuf, signedStr)
}
const github = require('../controllers/github.controller');
const verify = require('../middlewares/verify.middleware');

module.exports = (app) => {
    app.post('/api/webhook/github/:requestToken', verify, github.notify)
}

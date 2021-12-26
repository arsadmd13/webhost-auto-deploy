const express = require('express'),
        bodyParser = require('body-parser'),
        mongoose = require('mongoose'),
        app = express(),
        db = require('./src/config/db').MongoURI;

require("dotenv").config();
        
mongoose.connect(db, {
  useNewUrlParser: true, 
  useUnifiedTopology: true
}).then(() => 
  console.log("DB Connected!")
);

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static(__dirname + "/public/"));
        
require("./src/routes/webhook.route")(app);
        
app.listen(process.env.PORT || 3000, () => {
    console.log("Server is up and running!");
})
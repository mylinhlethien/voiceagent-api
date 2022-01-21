//var config = require('./config');
const app = require('express')()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const axios = require('axios');
require('dotenv').config({ path: '.env' })

/* Don't forget to export before npm install
      export CPPFLAGS=-I/usr/local/opt/openssl/include
    and
      export LDFLAGS=-L/usr/local/opt/openssl/lib

    or to add it as ENV in Dockerfile
*/

/** KAFKA AUTHENTIFICATION */
var Kafka = require('node-rdkafka');
var fs = require('fs');
var opts = {};
var topic = 'watson-messages';

opts.brokers = process.env.KAFKABROKERS;
opts.api_key = process.env.KAFKAAPIKEY;

//IBM Cloud/Ubuntu: '/etc/ssl/certs'
// Red Hat: '/etc/pki/tls/cert.pem',
// macOS: '/usr/local/etc/openssl/cert.pem' from openssl installed by brew
//opts.calocation = '/usr/local/etc/openssl/cert.pem';
opts.calocation = '/etc/ssl/certs';
if (!fs.existsSync(opts.calocation)) {
    console.error('Error - Failed to access <cert_location> : ' + opts.calocation);
    process.exit(-1);
}

var driver_options = {
    //'debug': 'all',
    'metadata.broker.list': opts.brokers,
    'security.protocol': 'SASL_SSL',
    'ssl.ca.location': opts.calocation,
    'sasl.mechanisms': 'PLAIN',
    'sasl.username': 'token',
    'sasl.password': opts.api_key,
    'broker.version.fallback': '0.10.0',  // still needed with librdkafka 0.11.6 to avoid fallback to 0.9.0
    'log.connection.close': false
};

var admin_opts = {
    'client.id': 'kafka-nodejs-console-sample-admin',
};
for (var key in driver_options) {
    admin_opts[key] = driver_options[key];
}
var consumer_opts = {
    'client.id': 'kafka-nodejs-console-sample-consumer-frankfurt',
    'group.id': 'kafka-nodejs-console-sample-groupmyclusterfrankfurt'
};
for (var key in driver_options) {
    consumer_opts[key] = driver_options[key];
}
var topicOpts_consumer = {
    'auto.offset.reset': 'latest'
};

console.log("Kafka Endpoints: " + opts.brokers);

var consumer = new Kafka.KafkaConsumer(consumer_opts, topicOpts_consumer);

/******* CLOUDANT AUTHENTIFICATION */

const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { BasicAuthenticator } = require('ibm-cloud-sdk-core');

const authenticator = new BasicAuthenticator({
    username: process.env.CLOUDANTUSERNAME,
    password: process.env.CLOUDANTPASSWORD,
    iamProfileName: "user"
});

const service = new CloudantV1({
    authenticator: authenticator
});

service.setServiceUrl(process.env.CLOUDANTURL);


/******* NLU credentials ***************/
const { IamAuthenticator } = require('ibm-watson/auth');
const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1');
const naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
    version: '2019-07-12',
    authenticator: new IamAuthenticator({
        apikey: process.env.NLUAPIKEY,
    }),
    url: process.env.NLUURL
});

/******* Language translator credentials ***************/

const LanguageTranslatorV3 = require('ibm-watson/language-translator/v3');
const languageTranslator = new LanguageTranslatorV3({
    version: '2018-05-01',
    authenticator: new IamAuthenticator({
        apikey: process.env.TRANSLATORAPIKEY,
    }),
    serviceUrl: process.env.TRANSLATORURL
});

/** ODM CREDENTIALS */

const resConfig = {
    auth: {
        username: process.env.ODMUSERNAME,
        password: process.env.ODMPASSWORD
    }
};

const resUrl = process.env.ODMURL;

var odmServiceInput = {
    "entite": {
        "entity": "concurrence",
        "value": "AssuranceToutRisk"
    },
    "emotion": {
        "name": "",
        "score": 0
    },
    "recommandation": {
        "urgence": 0,
        "action": "Pas de recommandation",
        "message": "Pas de recommandation"
    },
    "__DecisionID__": "string",
    "client": {
        "_id": "string",
        "_rev": "string",
        "nomclient": "Pierre Martin",
        "numeroclient": 3000,
        "contrats": [
            {
                "typecontrat": "string",
                "formule": "string",
                "date": "string",
                "reference": 3
            }
        ],
        "historique": [
            {
                "typecontrat": "string",
                "sinistre": "string",
                "date": "string"
            }
        ],
        "Potentiel": 0.9,
        "Sinistralite": 0.2
    },
    "intent": {
        "intent": "releve-info",
        "confidence": 10517320
    }
}

// Variables
var client = []; //identify the number of the client
var list_messages = ""; //messages from the client that need to be sent to NLU for sentiment analysis
var last_message = ""; //last message of the conversation to display in the recommandations window

//connection to the Kafka consumer
//connects to the broker
consumer.connect();

//logging all errors
consumer.on('event.error', function (err) {
    console.error('Error from consumer');
    console.error(err);
});

consumer.on('ready', function (arg) {
    // Subscribe to the librdtesting-01 topic
    // This makes subsequent consumes read from that topic.
    consumer.subscribe([topic]);

    console.log("consumer connected");

    //Gets messages from the existing subscription as quickly as possible. This method keeps a background thread running to do the work.
    consumer.consume();

    console.log('consumer ready.' + JSON.stringify(arg));

});

consumer.on('data', function (data) {
    //messages consumed by Kafka
    var msg = data.value.toString();
    var obj = JSON.parse(msg);
    //console.log(obj);
    if (obj.output != undefined && obj.output.generic != undefined) {
        for (i = 0; i < obj.output.generic.length; i++) {
            if (obj.output.generic[i].response_type == "text" && obj.output.generic[i].text != "") {
                console.log(obj.output.generic[i].text);
                io.emit('chat-messages', obj);
            }
        }
    }

    /** ANALYSE SENTIMENTS NLU */
    //every message from the client are added in the variable "list_messages" in order to send it to NLU for sentiment analysis
    if (obj.input !== undefined && obj.input.text != '' && obj.input.text != 'vgwPostResponseTimeout') {
        list_messages = list_messages + ". " + obj.input.text;
        io.emit('chat-messages', obj);
        console.log(obj.input.text);
    }

    /** CLOUDANT CLIENT PROFILE */
    //we call our Cloudant database to get the document corresponding to the client
    if (obj.output != undefined && obj.output.entities[0] != undefined) {
        //we collect the client identification number in the variable "client"
        if (obj.output.entities[0].entity == "sys-number") {
            client.push(obj.output.entities[0].interpretation.numeric_value);
        }
        /** CAPTER TYPE CONTRAT */

        for (i = 0; i < obj.output.entities.length; i++) {
            if (obj.output.entities[i].entity == 'type-contrat') {
                io.emit('intent-resiliation', "Demande de résiliation - Contrat " + obj.output.entities[0].value);
            }
            else if (obj.output.entities[i].entity == "raison-resiliation") {

                //if "concurrence" entity is detected, we send it in the ODM input, otherwise we send the reason of resiliation in the ODM input
                if (obj.output.entities[i + 1] !== undefined && obj.output.entities[i + 1].entity == "concurrence") {
                    odmServiceInput.entite.entity = "concurrence";
                    odmServiceInput.entite.value = obj.output.entities[i + 1].value;
                    io.emit('raison-resiliation', obj.output.entities[i].value + " - Concurrence : " + obj.output.entities[i + 1].value);
                }
                else {
                    odmServiceInput.entite.entity = "raison-resiliation";
                    odmServiceInput.entite.value = obj.output.entities[i].value;
                    io.emit('raison-resiliation', obj.output.entities[i].value);
                }

                const translateParams = {
                    text: list_messages,
                    modelId: 'fr-en',
                };

                //Translation in English of the messages and NLU call for sentiment analysis
                languageTranslator.translate(translateParams)
                    .then(translationResult => {
                        translatedText = translationResult.result.translations[0].translation;
                        console.log("***TEXTE INITIAL *******" + translateParams.text);
                        console.log("***TEXTE TRADUIT *******" + translatedText);

                        const analyzeParams = {
                            'text': translatedText,
                            'features': {
                                'emotion': {
                                    'document': true
                                }
                            }
                        };

                        naturalLanguageUnderstanding.analyze(analyzeParams)
                            .then(analysisResults => {
                                console.log(JSON.stringify(analysisResults.result.emotion.document.emotion, null, 2));
                                sad = analysisResults.result.emotion.document.emotion.sadness;
                                joy = analysisResults.result.emotion.document.emotion.joy;
                                fear = analysisResults.result.emotion.document.emotion.fear;
                                disgust = analysisResults.result.emotion.document.emotion.disgust;
                                anger = analysisResults.result.emotion.document.emotion.anger;

                                /******** result interpretation : get the most important emotion ******************************/

                                max1 = Math.max(sad, joy, fear, disgust, anger);
                                switch (max1) {
                                    case sad:
                                        emotion = "Tristesse";
                                        console.log("Sentiment : " + emotion + "/ Score : " + max1);
                                        break;
                                    case joy:
                                        emotion = "Joie";
                                        console.log("Sentiment : " + emotion + "/ Score : " + max1);
                                        break;
                                    case fear:
                                        emotion = "Peur";
                                        console.log("Sentiment : " + emotion + "/ Score : " + max1);
                                        break;
                                    case disgust:
                                        emotion = "Dégoût";
                                        console.log("Sentiment : " + emotion + "/ Score : " + max1);
                                        break;
                                    case anger:
                                        emotion = "Colère";
                                        console.log("Sentiment : " + emotion + "/ Score : " + max1);
                                        break;
                                }

                                //the emotion and its score are sent as the ODM input
                                odmServiceInput.emotion.name = emotion;
                                odmServiceInput.emotion.score = max1;

                                //display the emotions in the recommandations window
                                io.emit('emotions', { "sentiment": emotion, "score": max1 });

                                /** ODM call */
                                axios.post(resUrl, odmServiceInput, resConfig)
                                    .then(function (response) {
                                        console.log(odmServiceInput);
                                        var recommandations = response.data.recommandation;
                                        console.log(recommandations);

                                        service.postFind({
                                            db: process.env.DB1NAME,
                                            selector: { "_id": "cfad004d78c0decb7b08aa3a6ce525dd" }
                                        }).then(response => {
                                            console.log(response.result);
                                            service.putDocument({
                                                db: process.env.DB1NAME,
                                                docId: 'cfad004d78c0decb7b08aa3a6ce525dd',
                                                document: {
                                                    _id: "cfad004d78c0decb7b08aa3a6ce525dd",
                                                    urgence: recommandations.urgence,
                                                    action: recommandations.action,
                                                    message: recommandations.message,
                                                    _rev: response.result.docs[0]._rev
                                                }
                                            }).then(response => {
                                                console.log(response.result);
                                            });
                                        });

                                        //display ODM recommandations in the recommandations window
                                        io.emit("recommandations", recommandations);

                                    })
                                    .catch(function (error) {
                                        console.log('Error executing Decision Service', error);
                                    });
                            })
                            .catch(err => {
                                console.log('error:', err);
                            });
                    })
                    .catch(err => {
                        console.log('error:', err);
                    });
            }
            else if (obj.output.entities[i].entity == "sys-time") {
                last_message = obj.output.generic[0].text
                io.emit("lastmessage", last_message);
            }
        }

        //We call the emotion analysis at the end of the conversation, when the client tells the reasons of resiliation

        //if the client booked a RDV with the advisor at the end of the conversation, we display the last message in the recommandations window

    }

    if (obj.input != undefined && (obj.input.text == 'caller_hangup')) {
        service.postFind({
            db: process.env.DB1NAME,
            selector: { "_id": "cfad004d78c0decb7b08aa3a6ce525dd" }
        }).then(response => {
            console.log(response.result);
            service.putDocument({
                db: process.env.DB1NAME,
                docId: 'cfad004d78c0decb7b08aa3a6ce525dd',
                document: {
                    _id: "cfad004d78c0decb7b08aa3a6ce525dd",
                    urgence: "",
                    action: "",
                    message: "",
                    _rev: response.result.docs[0]._rev
                }
            }).then(response => {
                console.log(response.result);
            });
        });

        client = [];
        list_messages = "";
        last_message = "";
    }

    //if the client's identification number is detected in the variable "client", we search in the Cloudant database if the client exists and we display the profile in the window
    //all the client's information are sent as an ODM input
    if (client.length == 1) {
        const selector = {
            "numeroclient": {
                "$eq": client[0]
            }
        };

        service.postFind({
            db: process.env.DB2NAME,
            selector: selector,
            fields: ["numeroclient",
                "nomclient",
                "contrats",
                "historique",
                "Sinistralite",
                "Potentiel"]
        }).then(response => {
            console.log(response.result);
            if (response.result.docs[0] != undefined) {
                odmServiceInput.client.numeroclient = response.result.docs[0].numeroclient;
                odmServiceInput.client.nomclient = response.result.docs[0].nomclient;
                odmServiceInput.client.Potentiel = response.result.docs[0].Potentiel;
                odmServiceInput.client.Sinistralite = response.result.docs[0].Sinistralite;
                io.emit('client-profile', response.result.docs[0]);
            }
            else {
                console.log("no results");
            }
        });
        client.push("stop");
    }
});

consumer.on('disconnected', function (data) {
    console.log("Disconnected. Reconnecting...");
    consumer.connect();
});

consumer.on('error', function (data) {
    console.log("Consumer error." + data);
});

consumer.on('uncaughtException', function (data) {
    console.log("uncaughtException" + data);
});

io.on("connect_error", (err) => {
    console.log(`connect_error due to ${err.message}`);
});

io.on("connect_failed", (err) => {
    console.log(`connect_failed due to ${err.message}`);
});

io.on("error", (err) => {
    console.log(`error due to ${err.message}`);
});

io.on("uncaughtException", (err) => {
    console.log(`uncaughtException due to ${err.message}`);

});

http.listen(8080, function () {
    console.log('listening on port 8080')
})

const path = require('path');
const fs = require('fs');
const https = require('https');

const Telegram = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const randomstring = require('randomstring');
const marked = require('marked');

const app = express();
app.use(bodyParser.json());

let users = {};

const DEFAULT_PORT = 4321;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DATABASE_USER = process.env.DATABASE_USER;
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD;

let telegramClient = false;

let readmeAsMarkup = marked(fs.readFileSync('./README.md', 'utf8'));
let sentMessages = {};


let pageMarkup = `<!DOCTYP html>
<html>
<head>
    <meta charset="utf-8"/>
    <title>
        Notifyy McNotifyFace
    </title>
    <link rel="stylesheet" href="https://cdn.rawgit.com/sindresorhus/github-markdown-css/gh-pages/github-markdown.css">
    <style>
        .markdown-body {
            box-sizing: border-box;
            min-width: 200px;
            max-width: 980px;
            margin: 0 auto;
            padding: 45px;
        }
    </style>
</head>
<body>
    <div class="markdown-body">
        ${readmeAsMarkup}
    </div>
</body>
</html>`;

function storeUser( token, user ){
    let data = {};
    data.token = token;
    for( let key in user ){
        if( !{}.hasOwnProperty.call(user, key) ){
            return false;
        }

        data[ key ] = user[ key ];
    }

    let postData = JSON.stringify( data );

    let request = https.request({
            hostname: 'kokarn.cloudant.com',
            port: 443,
            path: '/notifyy-users/',
            method: 'POST',
            auth: DATABASE_USER + ':' + DATABASE_PASSWORD,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength( postData )
            }
        }, (response) => {
            if(response.statusCode === 201){
                console.log('User', user.username, 'added to storage.');
            } else {
                console.err('Failed to add user', user.username, ' to storage. Got status', response.statusCode);
            }
        }
    )
    .on('error', (error) => {
        console.log(error.message);
    });

    request.write( postData );
    request.end();
}

function loadUsers(){
    let request = https.request({
            hostname: 'kokarn.cloudant.com',
            port: 443,
            path: '/notifyy-users/_design/list/_view/all',
            method: 'GET',
            auth: DATABASE_USER + ':' + DATABASE_PASSWORD
        }, (response) => {
            let data = '';
            response.setEncoding('utf8');

            response.on('data', (chunk) => {
                data = data + chunk;
            });

            response.on('end', () => {
                let dataSet = JSON.parse( data );
                for( let i = 0; i < dataSet.total_rows; i = i + 1 ){
                    users[ dataSet.rows[ i ].value.token ] = {
                        chatId: dataSet.rows[ i ].value.chatId,
                        username: dataSet.rows[ i ].value.username
                    };
                }
                console.log('User database load complete');
            });

        }
    )
    .on('error', (error) => {
        console.log(error.message);
    });

    request.end();
}

function formatString(string){
    // string = string.replace(/</gim, '&lt;');
    // string = string.replace(/>/gim, '&gt;');
    // string = string.replace(/&/gim, '&amp;');

    return string;
}

function buildMessage(request){
    let title = false;
    let message = false;
    let sendMessage = '';

    if(request.query.title && request.query.title.length > 0){
        title = '*' + formatString(request.query.title) + '*';
    }

    if(request.query.message && request.query.message.length > 0){
        message = formatString(request.query.message);
    }

    if(title){
        if( sendMessage.length > 0 ){
            sendMessage = sendMessage + '\n';
        }

        sendMessage = sendMessage + title;
    }

    if(message){
        if( sendMessage.length > 0 ){
            sendMessage = sendMessage + '\n';
        }

        sendMessage = sendMessage + message;
    }

    return sendMessage;
}

function sendMessage(chatId, message){
    let timestamp = process.hrtime();

    if(!sentMessages[ chatId ]){
        sentMessages[ chatId ] = [];
    }

    for( let i = sentMessages[ chatId ].length - 1; i >= 0; i = i - 1 ){
        let messageSentDiff = process.hrtime( sentMessages[ chatId ][ i ].timestamp );

        // Check if we've already sent a message in the last second
        if( messageSentDiff[ 0 ] === 0 ){
            return false;
        }
    }

    telegramClient.sendMessage(chatId, message, {
        parse_mode: 'markdown'
    });

    sentMessages[ chatId ].push( {
        message: message,
        timestamp: timestamp
    } );
}

app.get('/', (request, response) => {
    response.send(pageMarkup);
});

app.all('/out', (request, response, next) => {
    if(!request.query.message && !request.query.title){
        response.status(400).send();
        return false;
    }

    if(!request.query.user){
        response.status(400).send();
        return false;
    }

    if(typeof request.query.user === 'string'){
        request.query.user = [ request.query.user ];
    }

    next();
});

app.get('/out', (request, response) => {
    let messageString = buildMessage(request);
    let messageSent = false;

    if(request.query.url && request.query.url.length > 0){
        messageString = messageString + '\n' + request.query.url;
    }

    for(let i = 0; i < request.query.user.length; i = i + 1){
        if(!users[ request.query.user[ i ] ]){
            continue;
        }

        messageSent = true;

        sendMessage(users[ request.query.user[ i ] ].chatId, messageString);
    }

    if( !messageSent ){
        response.status(400).send();
        return false;
    }

    response.status(204).send();
});

app.post('/out', (request, response) => {
    let messageString = buildMessage(request);

    if(request.body.code && request.body.code.length > 0){
        let formattedCode = request.body.code.replace(/\\n/gim, '\n');
        formattedCode = formattedCode.replace(/\"/gim, '"');
        messageString = messageString + '\n```\n' + formattedCode + '\n```';
    }

    if(request.query.url && request.query.url.length > 0){
        messageString = messageString + '\n' + request.query.url;
    }

    for(let i = 0; i < request.query.user.length; i = i + 1){
        if(!users[ request.query.user[ i ] ]){
            continue;
        }

        messageSent = true;
        sendMessage(users[ request.query.user[ i ] ].chatId, messageString);
    }

    if(!messageSent){
        response.status(400).send();
        return false;
    }

    response.status(204).send();
});

if(!TELEGRAM_TOKEN){
    console.error('Missing telegram token. Please add the environment variable TELEGRAM_TOKEN with a valid token.');
    process.exit(1);
}

if(TELEGRAM_TOKEN.length < 45){
    console.error('Invalid telegram token passed in with TELEGRAM_TOKEN.');
    process.exit(1);
}

if(!DATABASE_USER){
    console.error('Missing database user. Please add the environment variable DATABASE_USER with a valid string.');
    process.exit(1);
}

if(!DATABASE_PASSWORD){
    console.error('Missing database password. Please add the environment variable DATABASE_PASSWORD with a valid string.');
    process.exit(1);
}

telegramClient = new Telegram(
    TELEGRAM_TOKEN,
    {
        polling: true
    }
);

loadUsers();

telegramClient.on('message', (message) => {
    var user = {
        chatId: message.chat.id,
        username: message.chat.username
    };

    for(let token in users){
        if(users[ token ].username === message.chat.username){
            telegramClient.sendMessage(message.chat.id, 'Welcome back! Your access token is \n' + token);
            return false;
        }
    }

    console.log('Adding', message.chat.username, 'to users.');

    let token = randomstring.generate();
    users[ token ] = user;

    storeUser( token, user );

    telegramClient.sendMessage(message.chat.id, 'Congrats! You are now added to the bot. Use the token \n' + token + '\n to authenticate.');
});

app.listen( process.env.PORT || DEFAULT_PORT, () => {
    console.log('Service up and running on port', process.env.PORT || DEFAULT_PORT);
});

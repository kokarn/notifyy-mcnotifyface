const path = require('path');
const fs = require('fs');

const Telegram = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const randomstring = require('randomstring');

const app = express();
app.use(bodyParser.json());

let configDefaults = {
    port: 4321
};

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CONFIG_PATH = path.join( __dirname + '/config.js' );

let config = false;

let telegramClient = false;

function setDefaults(){
    config = {
        port: configDefaults.port,
        users: {}
    };

    writeConfigFile({
        sync: true
    });
}

function writeConfigFile(options){
    if(options.sync){
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config));
    } else {
        fs.writeFile(CONFIG_PATH, JSON.stringify(config), (error) => {
            if(error){
                throw error;
            }
        });
    }
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
    let sendMessage = buildMessage(request);
    let messageSent = false;

    if(request.query.url && request.query.url.length > 0){
        sendMessage = sendMessage + '\n' + request.query.url;
    }

    for(let i = 0; i < request.query.user.length; i = i + 1){
        if(!config.users[ request.query.user[ i ] ]){
            continue;
        }

        messageSent = true;
        telegramClient.sendMessage(config.users[ request.query.user[ i ] ].chatId, sendMessage, {
            parse_mode: 'markdown'
        });
    }

    if( !messageSent ){
        response.status(400).send();
        return false;
    }

    response.status(204).send();
});

app.post('/out', (request, response) => {
    let sendMessage = buildMessage(request);

    if(request.body.code && request.body.code.length > 0){
        let formattedCode = request.body.code.replace(/\\n/gim, '\n');
        formattedCode = formattedCode.replace(/\"/gim, '"');
        sendMessage = sendMessage + '\n```\n' + formattedCode + '\n```';
    }

    if(request.query.url && request.query.url.length > 0){
        sendMessage = sendMessage + '\n' + request.query.url;
    }

    for(let i = 0; i < request.query.user.length; i = i + 1){
        if(!config.users[ request.query.user[ i ] ]){
            continue;
        }

        messageSent = true;
        telegramClient.sendMessage(config.users[ request.query.user[ i ] ].chatId, sendMessage, {
            parse_mode: 'markdown'
        });
    }

    if(!messageSent){
        response.status(400).send();
        return false;
    }

    response.status(204).send();
});

fs.access(CONFIG_PATH, fs.R_OK, (err) => {
    if(err){
        setDefaults();
    } else {
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        } catch (err){
            console.error('Unable to parse config file "' + CONFIG_PATH + '". Please make sure it\'s valid.');
            process.exit(1);
        }
    }

    if(!TELEGRAM_TOKEN){
        console.error('Missing telegram token. Please add the environment variable TELEGRAM_TOKEN with a valid token.');
        process.exit(1);
    }

    if(TELEGRAM_TOKEN.length < 45){
        console.error('Invalid telegram token passed in with TELEGRAM_TOKEN.');
        process.exit(1);
    }

    telegramClient = new Telegram(
        TELEGRAM_TOKEN,
        {
            polling: true
        }
    );

    telegramClient.on('message', (message) => {
        var user = {
            chatId: message.chat.id,
            username: message.chat.username
        };

        for(let token in config.users){
            if(config.users[ token ].username === message.chat.username){
                telegramClient.sendMessage(message.chat.id, 'You are already in the list of watchers. Your access token is \n' + token);
                return false;
            }
        }

        console.log('Adding', message.chat.username, 'to users.');

        let token = randomstring.generate();
        config.users[ token ] = user;

        writeConfigFile();

        telegramClient.sendMessage(message.chat.id, 'Congrats! You are now added to the bot. Use the token \n' + token + '\n to authenticate.');
    });

    app.listen( process.env.PORT || config.port, () => {
        console.log('Service up and running on port', process.env.PORT || config.port);
    });
});

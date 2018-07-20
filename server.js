require('dotenv').config();

const fs = require( 'fs' );
const https = require( 'https' );

const Telegram = require( 'node-telegram-bot-api' );
const express = require( 'express' );
const bodyParser = require( 'body-parser' );
const randomstring = require( 'randomstring' );
const marked = require( 'marked' );

const app = express();

const DEFAULT_PORT = 4321;
const MESSAGE_CACHE_TIME = 3600;
const TELEGRAM_TOKEN_LENGTH = 45;

const SUCCESS_RESPONSE_CODE = 204;
const ERROR_RESPONSE_CODE = 400;

const DATABASE_SUCCESS_STATUS_CODE = 200;

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DATA_STORAGE_ID = process.env.DATA_STORAGE_ID;
const DATA_STORAGE_KEY = process.env.DATA_STORAGE_KEY;
const DATA_STORAGE_HOSTNAME = 'api.jsonbin.io';

let telegramClient = false;

const sentMessages = {};
const users = {};

// eslint-disable-next-line no-sync
const readmeAsHTML = marked( fs.readFileSync( './README.md', 'utf8' ) );

const pageMarkup = `<!DOCTYP html>
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
        ${ readmeAsHTML }
    </div>
</body>
</html>`;

app.use( bodyParser.json() );

const storeUser = function storeUser ( token, user ) {
    const userData = {};

    userData.token = token;
    for ( const key in user ) {
        if ( !Reflect.apply( {}.hasOwnProperty, user, key ) ) {
            return false;
        }

        userData[ key ] = user[ key ];
    }

    const postData = JSON.stringify( userData );

    const request = https.request(
        {
            headers: {
                'Content-Length': Buffer.byteLength( postData ),
                'Content-Type': 'application/json',
                'secret-key': DATA_STORAGE_KEY
            },
            hostname: DATA_STORAGE_HOSTNAME,
            method: 'PUT',
            path: `/b/${ DATA_STORAGE_ID }`,
            port: 443,
        },
        ( response ) => {
            if ( response.statusCode === DATABASE_SUCCESS_STATUS_CODE ) {
                console.log( 'User', user.username, 'added to storage.' );
            } else {
                console.err( 'Failed to add user', user.username, ' to storage. Got status', response.statusCode );
            }
        }
    )
    .on( 'error', ( error ) => {
        console.log( error.message );
    } );

    request.write( postData );
    request.end();

    return true;
};

const loadUsers = function loadUsers () {
    const request = https.request(
        {
            hostname: DATA_STORAGE_HOSTNAME,
            method: 'GET',
            headers: {
                'secret-key': DATA_STORAGE_KEY
            },
            path: `/b/${ DATA_STORAGE_ID }`,
            port: 443,
        },
        ( response ) => {
            let userData = '';

            response.setEncoding( 'utf8' );

            response.on( 'data', ( chunk ) => {
                userData = userData + chunk;
            } );

            response.on( 'end', () => {
                const dataSet = JSON.parse( userData );

                for ( const userData of dataSet ) {
                    users[ userData.token ] = {
                        chatId: userData.chatId,
                        username: userData.username,
                    };
                }

                console.log( 'User database load complete' );
            } );
        }
    )
    .on( 'error', ( error ) => {
        console.log( error.message );
    } );

    request.end();
};

const formatString = function formatString ( string ) {
    // string = string.replace(/</gim, '&lt;' );
    // string = string.replace(/>/gim, '&gt;' );
    // string = string.replace(/&/gim, '&amp;' );

    return string;
};

const buildMessage = function buildMessage ( request ) {
    let title = false;
    let message = false;
    const messageObject = {
        string: '',
        options: {
            disable_notification: false,
        },
    };

    if ( request.query.title && request.query.title.length > 0 ) {
        title = `* ${ formatString( request.query.title ) } *`;
    }

    if ( request.query.message && request.query.message.length > 0 ) {
        message = formatString( request.query.message );
    }

    if ( title ) {
        if ( messageObject.string.length > 0 ) {
            messageObject.string = `${ messageObject.string }\n`;
        }

        messageObject.string = `${ messageObject.string }${ title }`;
    }

    if ( message ) {
        if ( messageObject.string.length > 0 ) {
            messageObject.string = `${ messageObject.string }\n`;
        }

        messageObject.string = `${ messageObject.string }${ message }`;
    }

    if ( request.query.notification ) {
        messageObject.options.disable_notification = !(request.query.notification == 'true');
    }

    return messageObject;
};

const sendMessage = function sendMessage ( chatId, messageData ) {
    const timestamp = process.hrtime();

    if ( !sentMessages[ chatId ] ) {
        sentMessages[ chatId ] = [];
    }

    if ( typeof messageData === 'string' ) {
        messageData = {
            string: messageData,
        };
    }

    for ( let i = sentMessages[ chatId ].length - 1; i >= 0; i = i - 1 ) {
        const messageSentDiff = process.hrtime( sentMessages[ chatId ][ i ].timestamp );

        // Check if it's an old message
        if ( messageSentDiff[ 0 ] > MESSAGE_CACHE_TIME ) {
            // If it's an old message, remove it and continue
            sentMessages[ chatId ].splice( i, 1 );
            continue;
        }

        // Check if we've already sent a message in the last second
        if ( messageSentDiff[ 0 ] === 0 ) {
            return false;
        }

        // Check if we've already sent this message
        if ( sentMessages[ chatId ][ i ].message === messageData.string ) {
            return false;
        }
    }

    return telegramClient.sendMessage( chatId, messageData.string, {
        // eslint-disable-next-line camelcase
        parse_mode: 'markdown',
        ...messageData.options,
    } )
        .then( () => {
            sentMessages[ chatId ].push( {
                message: messageData.string,
                timestamp: timestamp,
            } );
        } );
};

app.get( '/', ( request, response ) => {
    response.send( pageMarkup );
} );

app.all( '/out', ( request, response, next ) => {
    // If we got a message in body but not in query, use that
    if ( request.body.message && !request.query.message ) {
        request.query.message = request.body.message;
    }

    // If we got a title in body but not in query, use that
    if ( request.body.title && !request.query.title ) {
        request.query.title = request.body.title;
    }

    // If we got a url in body but not in query, use that
    if ( request.body.url && !request.query.url ) {
        request.query.url = request.body.url;
    }

    // If we got users in body but not in query, use that
    if ( request.body.users && !request.query.users ) {
        request.query.users = request.body.users;
    }

    // If we got a user in body but not in query, use that
    if ( request.body.user && !request.query.user ) {
        request.query.user = request.body.user;
    }

    // Fallback for when we provide the old "user" instead of "users"
    if ( typeof request.query.user !== 'undefined' && typeof request.query.users === 'undefined' ){
        if ( typeof request.query.user === 'string' ) {
            request.query.users = [ request.query.user ];
        } else {
            request.query.users = request.query.user;
        }
    }

    if ( !request.query.message && !request.query.title ) {
        response.status( ERROR_RESPONSE_CODE ).send();

        return false;
    }

    if ( !request.query.users ) {
        response.status( ERROR_RESPONSE_CODE ).send();

        return false;
    }

    if ( typeof request.query.users === 'string' ) {
        request.query.users = [ request.query.users ];
    }

    next();

    return true;
} );

app.get( '/out', ( request, response ) => {
    const messageData = buildMessage( request );
    let messagePromises = [];

    if ( request.query.url && request.query.url.length > 0 ) {
        messageData.string = `${ messageData.string }\n${ request.query.url }`;
    }

    for ( let i = 0; i < request.query.users.length; i = i + 1 ) {
        if ( !users[ request.query.users[ i ] ] ) {
            continue;
        }

        messagePromises.push( sendMessage( users[ request.query.users[ i ] ].chatId, messageData ) );
    }

    Promise.all( messagePromises )
        .then( () => {
            response.status( SUCCESS_RESPONSE_CODE ).send();
        } )
        .catch( ( sendError ) => {
            response.status( ERROR_RESPONSE_CODE ).send( sendError.response.body.description );
        } );
} );

app.post( '/out', ( request, response ) => {
    const messageData = buildMessage( request );
    let messagePromises = [];

    if ( request.body.code && request.body.code.length > 0 ) {
        let formattedCode = request.body.code.replace( /\\n/gim, '\n' );

        formattedCode = formattedCode.replace( /"/gim, '"' );
        messageData.string = `${ messageData.string }\n\`\`\`\n${ formattedCode }\n\`\`\``;
    }

    if ( request.query.url && request.query.url.length > 0 ) {
        messageData.string = `${ messageData.string }\n${ request.query.url }`;
    }

    for ( let i = 0; i < request.query.users.length; i = i + 1 ) {
        if ( !users[ request.query.users[ i ] ] ) {
            continue;
        }

        messagePromises.push( sendMessage( users[ request.query.users[ i ] ].chatId, messageData ) );
    }

    Promise.all( messagePromises )
        .then( () => {
            response.status( SUCCESS_RESPONSE_CODE ).send();
        } )
        .catch( ( sendError ) => {
            response.status( ERROR_RESPONSE_CODE ).send( sendError.response.body.description );
        } );
} );

if ( !TELEGRAM_TOKEN ) {
    throw new Error( 'Missing telegram token. Please add the environment variable TELEGRAM_TOKEN with a valid token.' );
}

if ( TELEGRAM_TOKEN.length < TELEGRAM_TOKEN_LENGTH ) {
    throw new Error( 'Invalid telegram token passed in with TELEGRAM_TOKEN.' );
}

if ( !DATA_STORAGE_ID ) {
    throw new Error( 'Missing data id. Please add the environment variable DATA_STORAGE_ID with a valid string.' );
}

if ( !DATA_STORAGE_KEY ) {
    throw new Error( 'Missing data secret key. Please add the environment variable DATA_STORAGE_KEY with a valid string.' );
}

telegramClient = new Telegram(
    TELEGRAM_TOKEN,
    {
        polling: true,
    }
);

loadUsers();

telegramClient.on( 'message', ( message ) => {
    const user = {
        chatId: message.chat.id,
        username: message.chat.username,
    };

    for ( const userToken in users ) {
        if ( users[ userToken ].username === message.chat.username ) {
            telegramClient.sendMessage( message.chat.id, `Welcome back! Your access token is \n${ userToken }` );

            return false;
        }
    }

    console.log( 'Adding', message.chat.username, 'to users.' );

    const token = randomstring.generate();

    users[ token ] = user;

    storeUser( token, user );

    telegramClient.sendMessage( message.chat.id, `Congrats! You are now added to the bot. Use the token \n${ token }\n to authenticate.` );

    return true;
} );

app.listen( process.env.PORT || DEFAULT_PORT, () => {
    console.log( 'Service up and running on port', process.env.PORT || DEFAULT_PORT );
} );

# Notifyy McNotifyFace
> A simple, stupid Node-based notification service for Telegram.  
> https://github.com/kokarn/notifyy-mcnotifyface  

Request an url and get a message on Telegram, it's that simple.

## Setting up
The only setup you need is a token for each user you want to send messages to.  
To get yours, just talk to  [@MessageRelayBot](https://web.telegram.org/#/im?p=@MessageRelayBot) on Telegram.   
It should respond with a token.

## Usage
Send a request to [https://notifyy-mcnotifyface.herokuapp.com/out?title=Hello%20World&users=*TOKEN*](https://notifyy-mcnotifyface.herokuapp.com/out?title=Hello%20World&users=*TOKEN*) with *TOKEN* replaced with the token you got. If everything is working as intended you should get a message.

There's also a [node module](https://www.npmjs.com/package/node-notifyy).

### Limitations
To prevent spamming users, a unique message can only be sent once every hour.

### Available parameters

| Key            | Method     | Required            | Type               |
|----------------|------------|---------------------|--------------------|
| title          | GET & POST | YES (if no message) | string             |
| message        | GET & POST | YES (if no title)   | string             |
| users          | GET & POST | YES                 | string             |
| url            | GET & POST | NO                  | url-encoded string |
| code           | POST       | NO                  | See special note   |
| notification   | GET & POST | NO                  | boolean            |


### Sending to multiple users
To send to multiple users just add the key multiple times.
E.g `?title=Hello&users=*TOKEN1*&users=*TOKEN2*`

### Sending code
If you want to post code you need to encode it correctly.  
* All newlines (`\n` and `\n\r`) should be replaced with `\\n`  
* All `"` replaced with `\"`  

After that you send it as a POST request with a `application/json` body with a single property, code.

### Message formatting
Every message is sent in "markdown_mode".
This means that you can use the [basic markdown functionaltiy of telegram](https://core.telegram.org/bots/api#formatting-options) to format your messages.
<pre>
*bold text*
_italic text_
[text](http://www.example.com/)
`inline fixed-width code`
```text
pre-formatted fixed-width code block
```</pre>

## Response codes

| Code | Meaning                                                                                         |
|------|-------------------------------------------------------------------------------------------------|
| 204  | Got a request and a message has been sent to the specified user(s)                              |
| 400  | Got a request without a valid user or without both title and message                            |

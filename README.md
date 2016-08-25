# Notifyy McNotifyFace

A simple, stupid Node-based notify service for Telegram.


## Response codes

| Code | Meaning                                                                                         |
|------|-------------------------------------------------------------------------------------------------|
| 204  | Got a request and a message has been sent to the specified user(s)                              |
| 400  | Got a request without a valid user or without both title and message                            |

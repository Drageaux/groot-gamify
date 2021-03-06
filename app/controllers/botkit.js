//CONFIG===============================================

/* Uses the slack button feature to offer a real time bot to multiple teams */
var Botkit = require('botkit');
var mongoUri = process.env.MONGODB_URI || 'mongodb://localhost/groot-gamify';
var botkit_mongo_storage = require('../../config/botkit_mongo_storage')({mongoUri: mongoUri});

if (!process.env.SLACK_ID || !process.env.SLACK_SECRET || !process.env.PORT) {
    console.log('Error: Specify SLACK_ID SLACK_SECRET and PORT in environment');
    process.exit(1);
}

var controller = Botkit.slackbot({
    storage: botkit_mongo_storage
});

exports.controller = controller;


//CONNECTION FUNCTIONS=====================================================
exports.connect = function (team_config) {
    var bot = controller.spawn(team_config);
    controller.trigger('create_bot', [bot, team_config]);
};

// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};

function trackBot(bot) {
    _bots[bot.config.token] = bot;
}

controller.on('create_bot', function (bot, team) {

    if (_bots[bot.config.token]) {
        // already online! do nothing.
        console.log("already online! do nothing.")
    } else {
        bot.startRTM(function (err) {
            if (!err) {
                trackBot(bot);

                console.log("RTM ok")
                controller.saveTeam(team, function (err, id) {
                    if (err) {
                        console.log("Error saving team")
                    } else {
                        console.log("Team " + team.name + " saved")
                    }
                })
            } else {
                console.log("RTM failed")
            }
            bot.startPrivateConversation({user: team.createdBy}, function (err, convo) {
                if (err) {
                    console.log(err);
                } else {
                    convo.say('I am a bot that you just installed');
                    convo.say('You must now /invite me to a channel so that I can be of use!');
                }
            });

        });
    }
});

//REACTIONS TO EVENTS==========================================================

// handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
    bot.startRTM(function (err) {
        if (!err) {
            trackBot(bot);
            console.log("RTM ok")
        } else {
            console.log("RTM failed")
        }

    });
});

//DIALOG======================================================================

controller.hears('hello', 'direct_message', function (bot, message) {
    bot.reply(message, 'Hello!');
});

// interactive messages example
controller.hears('challenge', 'mention,direct_mention', function (bot, message) {
    var replyMessage = {
        'text': 'Dave has started a Shaolin Showdown!',
        'attachments': [
            {
                'text': 'Who would you like to challenge?',
                'callback_id': 'challenge',
                'fallback': 'You have failed to challenge...',
                'attachment_type': 'default',
                'response_type': 'in_channel',
                'actions': [
                    {
                        'name': 'challenge',
                        'text': 'Jason',
                        'type': 'button',
                        'value': 'Jason'
                    },
                    {
                        'name': 'challenge',
                        'text': 'Jayleen',
                        'type': 'button',
                        'value': 'Jayleen'
                    },
                    {
                        'name': 'challenge',
                        'text': 'David',
                        'type': 'button',
                        'value': 'David'
                    }
                ]
            }
        ]
    };
    bot.reply(message, replyMessage)
});

// attachment example
controller.hears([/(a+)(w+)\s(y+)(e+)(a+)(h*)/gi], 'ambient,mention', function (bot, message) {
    console.log(message.text);
    var replyMessage = {
        "attachments": [{
            "fallback": "Required plain-text summary of the attachment.",
            "title": message.value,
            "image_url": "http://www.crowdnews.co.za/wp-content/uploads/2014/03/Aww-Yeah-meme.png"
        }]
    };
    bot.reply(message, replyMessage);
});

// add new user or update user to have 0 points
controller.hears([/update ny channel/i], 'mention,direct_mention', function (bot, message) {
    bot.api.groups.info({
        channel: 'G0ZJLUQM8',
        pretty: 1
    }, function (err, res) {
        if (err) {
            console.log('err:', err);
        } else {
            console.log('Updating NY channel members');
            var members = res.group.members;
            members.forEach(function (member) {
                controller.storage.users.get(member, function (err, user) {
                    if (err || !user) {
                        user = {
                            id: member,
                            team_id: message.team,
                            score: 0
                        }
                    }
                    controller.storage.users.save(user, function (err, savedUser) {
                        if (err) console.log('err:', err);
                        if (isNaN(savedUser.score) || !savedUser.score || savedUser.score <= 0) {
                            savedUser.score = 0;
                            controller.storage.users.save(savedUser, function (err, finalUser) {
                                console.log("User " + finalUser.id + " updated with score " + finalUser.score)
                            });
                        } else {
                            console.log("User " + savedUser.id + "'s score not changed and is " + savedUser.score);
                        }
                    });
                });
            })
        }
    })
});

controller.on('direct_message,mention,direct_mention', function (bot, message) {
    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face'
    }, function (err) {
        if (err) {
            console.log(err)
        }
        bot.reply(message, 'I heard you loud and clear boss.');
    });
});

controller.storage.teams.all(function (err, teams) {
    console.log(teams);
    if (err) {
        throw new Error(err);
    }

    // connect all teams with bots up to slack!
    for (var t in teams) {
        if (teams[t].bot) {
            var bot = controller.spawn(teams[t]).startRTM(function (err) {
                if (err) {
                    console.log('Error connecting bot to Slack:', err);
                } else {
                    trackBot(bot);
                }
            });
        }
    }
});

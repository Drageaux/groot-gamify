var express = require('express');
var api_slack_events_router = express.Router();

var slack_api = require('./custom_slack_web_api')();
var mongoUri = process.env.MONGODB_URI || 'mongodb://localhost/groot-gamify';
var storage = require('../../config/botkit_mongo_storage')({mongoUri: mongoUri});

api_slack_events_router.post('/', function (req, res) {
    if (req.body.event) console.log('** EVENT TRIGGERED:', req.body.event.type);

    // reactions events
    if (req.body.event &&
        (req.body.event.type == 'reaction_added' || req.body.event.type == 'reaction_removed')) {
        var item = req.body.event.item;
        if (!item) {
            console.log('err: no item found from reaction_added event');
            res.sendStatus(500);
            return;
        }

        // specify item type
        var options = {};
        var itemType = ''; // itemType isn't exactly like Slack's item.type
        switch (item.type) {
            case 'message':
                options = {
                    channel: item.channel,
                    timestamp: item.ts
                };
                itemType = 'message';
                break;
            case 'file':
                options = {file: item.file};
                itemType = 'file';
                break;
            case 'file_comment':
                options = {file_comment: item.file_comment};
                itemType = 'comment';
                break;
        }

        // retrieve item info
        slack_api.reactions.get(options, function (err, data) {
            // console.log('** RESPONSE:\n------------\n', data, '\n------------');

            if (req.body.event.type == "reaction_added") {
                eventHandler.reaction.added(data, itemType, res);
            } else if (req.body.event.type == "reaction_removed") {
                eventHandler.reaction.removed(data, itemType, res);
            }
        });
    } else {
        res.sendStatus(500);
        return;
    }
});


var eventHandler = {
    reaction: {
        added: function (data, itemType, res) {
            var emojis = data[itemType].reactions;
            var userId = data[itemType].user;
            var totalCount = 0;
            emojis.forEach(function (emoji) {
                totalCount += !isNaN(emoji.count) ? emoji.count : 0;
            });
            if (totalCount < 5) {
                res.sendStatus(200)
            } else {
                storageController.addPoints(userId, totalCount, res);
            }
        },
        removed: function (data, itemType, res) {
            var emojis = data[itemType].reactions;
            var userId = data[itemType].user;
            var totalCount = 0;
            emojis.forEach(function (emoji) {
                totalCount += !isNaN(emoji.count) ? emoji.count : 0;
            });
            if (totalCount < 4) {
                res.sendStatus(200)
            } else {
                storageController.removePoints(userId, totalCount, res);
            }
        }
    }
};

var storageController = {
    addPoints: function (userId, points, res) {
        storage.users.get(userId, function (err, user) {
            if (err || !user) {
                user = {
                    id: member,
                    team_id: message.team,
                    score: points
                }
            }
            storage.users.save(user, function (err, savedUser) {
                if (err) console.log('err:', err);
                if (isNaN(savedUser.score) || !savedUser.score) {
                    savedUser.score = points;
                } else {
                    savedUser.score += points;
                }
                storage.users.save(savedUser, function (err, finalUser) {
                    if (err) console.log('err:', err);
                    else {
                        console.log('User ' + finalUser.id + ' updated with score ' + finalUser.score);
                        res.json(finalUser);
                    }
                });
            });
        });
    },
    removePoints: function (userId, points, res) {
        storage.users.get(userId, function (err, user) {
            if (err || !user) {
                user = {
                    id: member,
                    team_id: message.team,
                    score: points
                }
            }
            storage.users.save(user, function (err, savedUser) {
                if (err) console.log('err:', err);
                if (isNaN(savedUser.score) || !savedUser.score) {
                    savedUser.score = -(points + 1);
                } else {
                    savedUser.score -= (points + 1);
                }
                storage.users.save(savedUser, function (err, finalUser) {
                    if (err) console.log('err:', err);
                    else {
                        console.log('User ' + finalUser.id + ' updated with score ' + finalUser.score);
                        res.json(finalUser);
                    }
                });
            });
        });
    }
};


module.exports = api_slack_events_router;
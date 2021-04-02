const express = require('express');
const https = require("https");
const app = express();
const port = process.env.PORT || 3000;
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
app.use(bodyParser())

const slackApi = "https://slack.com/api"
const risibankApi = "https://api.risibank.fr/api/v0"

// Home
app.get('/', async (req, res) => {
    res.status(404).end();
    res.send('Cheh');
});

// Endpoint that sends media to Slack
app.post('/interact', async (req, res) => {
    app.use(bodyParser.json({type: function() {return true;}
      }));
    try {
        console.log(req.body.payload);
        const { type} = JSON.parse(req.body.payload);

        switch(type){
            case "shortcut":
                const { trigger_id: triggerId } = JSON.parse(req.body.payload);
                await openModal(triggerId);
                break;
            case "block_actions":
                const { response_url: responseUrl, actions, channel, token, user} = JSON.parse(req.body.payload);

                var responseUrlEscaped=responseUrl.replace(/\\\//g, "/");
                switch(actions[0].action_id){
                  case "cancel":
                    await closeDialog(responseUrlEscaped);
                    break;
                  case "shuffle":
                    const imgUrl =  await fetchStickers(actions[0].value);
                    postToChannel(responseUrlEscaped, imgUrl, actions[0].value, true, true);
                    break;
                  case "send":
                    const userProfile = await fetchProfile(user.id);
                    await closeDialog(responseUrlEscaped);
                    await postMessage(channel.id,actions[0].value,userProfile);
                    break;
                  default:
                    return res.status(404).end();
                }
            default:
              return res.status(404).end();
        }
        return res.status(200).end();
    } catch (err) {
        console.log(err);
        res.payload=err;
        return res.status(503).end();
    }
});
// Endpoint that sends media to Slack
app.post('/get-gif', async (req, res) => {
    try {
        const { response_url: responseUrl, text : argument} = req.body;
        const imgUrl = await fetchStickers(argument);
        await postToChannel(responseUrl, imgUrl, argument, false, true);
        return res.status(200).end();
    } catch (err) {
        console.log(err);
        return res.status(503).end();
    }
});


const closeDialog = async (responseUrl) => {
    let data = {
        delete_original: "true"
    };
    return await fetch(responseUrl, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
    });
}

const postToChannel = async (responseUrl, imgUrl, argument, replaceOriginal,ephemeral) => {
    let data = {
    blocks: [
        {
            type: "image",
            title: {
                type: "plain_text",
                text: argument,
                emoji: true
            },
            image_url: imgUrl,
            alt_text: argument
        },
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        emoji: true,
                        text: "Send"
                    },
                    style: "primary",
                    action_id: "send",
                    value: imgUrl
                },
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        emoji: true,
                        text: "Shuffle"
                    },
                    action_id: "shuffle",
                    value: argument
                },
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        emoji: true,
                        text: "Cancel"
                    },
                    style: "danger",
                    action_id: "cancel"
                }
            ]
        }
        ]
    };
    if(ephemeral){
        data.response_type='ephemeral';
    } else {
        data.response_type='in_channel';
    }
    if(replaceOriginal){
        data.replace_original="true";
    }
    return await fetch(responseUrl, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
    });
}

const openModal = async (triggerId) => {
    const response = await fetch(`${slackApi}/views.open`, {
      body: JSON.stringify({
                            trigger_id: triggerId,
                            view:{

                               type: "modal",
                               title: {
                                    type: "plain_text",
                                    text: "My App",
                                    emoji: true
                                },
                                submit: {
                                    type: "plain_text",
                                    text: "Create"
                                },
                               blocks: [
                                 {
                                   block_id: "my_block_id",
                                   type: "input",
                                   optional: true,
                                   label: {
                                     type: "plain_text",
                                     text: "Select a channel to post the result on",
                                   },
                                   element: {
                                     action_id: "my_action_id",
                                     type: "conversations_select",
                                     response_url_enabled: true,
                                     default_to_current_conversation: true,
                                   },
                                 },
                               ]
                             }
                        }),
      headers: {
        Authorization: "Bearer "+process.env.AUTH_KEY,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    console.log(response);
    const data= await response.json();

    console.log(data);

    return;
}

const postMessage = async (channel, imgUrl, userProfile) => {
    const response = await fetch(`${slackApi}/chat.postMessage`, {
      body: JSON.stringify({
              username: userProfile.real_name_normalized,
              icon_url: userProfile.image_original,
              channel: channel,
              blocks: [
                {
                  type: 'image',
                  title: {type: 'plain_text', text: 'Found on risibank'},
                  image_url: imgUrl,
                  alt_text: 'risibank'
                }
              ]
            }),
      headers: {
        Authorization: "Bearer "+process.env.AUTH_KEY,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
    const data= await response.json();

    return;
}


fetchStickers = async (argument) => {

    const response = await fetch(`${risibankApi}/search?search=${argument}`, {
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01"
      },
      method: "POST"
    });
    const data= await response.json();

    if(data.stickers && data.stickers.length>0){
        const randomIndex = Math.floor(Math.random() * data.stickers.length);
        return data.stickers[randomIndex].risibank_link;
    }

    return;
}

fetchProfile = async (userId) => {
    const response = await fetch(`${slackApi}/users.profile.get?user=${userId}`, {
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        Authorization: "Bearer "+process.env.AUTH_KEY
      },
      method: "GET"
    })

    const data= await response.json();

    if(data.profile){
        return data.profile;
    }

    return;
}


app.listen(port, () => console.log(`App listening at ${process.env.HOST}:${port}`));
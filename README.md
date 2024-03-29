# MirrorerMachine
Keep a Discord server and a Simple Machines Forum instance synchronised.

Currently, MirrorerMachine requires that the Simple Machines Forum uses a MariaDB database. Other databases have not been tested.

# Functionality
## A single Discord slash command to set up synchronisation links between forum boards and Discord channels
`/mirrorer_linkchannel`
![Img](./img/mm2.png)

## A bot that requires Discord users to accept forum rules before getting access to the forum-synchronised channels
Users accept the rules by using a slash command `/mirrorer_nameme` that also gets them to set a unique forum nickname.
![Img](./img/mm6.png)

Name changes are not currently possible in the bot. The bot sends users trying to change their names a message to contact the bot's administrator about this. You can change their names in the database in the table `discordmirror_members`.


## Start a new topic in Discord or on the Simple Machines Forum and have it synchronised across both
![Img](./img/demo1.png)

## Post reply messages in Discord or on the Simple Machines Forum and have them synchronised across both
Topics/threads can be multi-platform, with MirrorerMachine acting as a messenger between the two platforms.

![Img](./img/demo2.png)

### Simple Machines Forum BBCode formatting options supported:
- Bold (`[b]bold[/b]`)
- Italics (`[i]italics[/i]`)
- Strikethrough text (`[s]strikethrough[/s]`)
- Underlined text (`[u]underline[/u]`)
- Monospaced text (`[pre]monospaced[/pre]`)
- Quotes, both single and multi-line (`[quote]quote...[/quote]`)
- Multiline code blocks (`[code]code[/code]`)
- URLs (`[iurl]URL[/iurl]`)
- Linked text (`[url=URL]text that links to URL[/url]`)
- Member pings that link to their profile pages (`[member=MEMBERID]MEMBERNAME[/member]`)
and any valid nesting of these BBCode tags, eg bold italics (`[b][i]bolditalics[/i][/b]` or `[i][b]bolditalics[/b][/i]`).

### Discord Markdown formatting options supported:
- Bold italics (`***bolditalics***`)
- Bold (`**bold**`)
- Italics (`*italics*` & `_italics_`)
- Strikethrough text (`~~Strikethrough~~`)
- Underline text (`__underline__`)
- Monospaced text (`` `monospaced` ``)
- Quotes, both single and multi-line (`> quote...`)
- Multiline code blocks (`` ```code``` ``)
- URLs
- Discord attachments (eg images)

Formatting options not included in these lists (eg BBCode tables) will not cause message syncing to fail, they will just not be translated. 
- For example, a BBCode table will appear in Discord as a pile of `[td]` and `[tr]` tags. (Discord Markdown does not support tables in any form.)

# Set-up
There is no publically-available MirrorerMachine Discord bot. Users need to create a MirrorerMachine bot on their own account and host the MirrorerMachine instance on a server of their own.

Set-up requires two steps:
1. Creating the Discord bot (to give the MirrorerMachine instance access to Discord)
2. Filling in the `config.json` file with the details of the specific forum and Discord server you want your MirrorerMachine to keep synchronised.

These instructions assume that before beginning set-up, you have:
1. A Simple Machines Forum hosted and running (can be empty)
2. A Discord server you wish to sync to that forum (can be empty)

## Creating your MirrorerMachine bot
These steps can be carried out on any computer with web access.

1. Log in to the Discord Developers portal: https://discord.com/developers/applications
2. Create a new application. Give it a name of your choice. Upload [MirrorerMachine's logo](MirrorerIcon.png) as the icon, if so desired.
3. Go to the 'Bot' tab of your application's page in the Developer Portal, and Add Bot. Turn *Priviledged Gateway Intents -> Message Content Intent* : *On*, and save changes. All other settings in the Bot tab have no effect on Mirrorer's functioning, but it makes sense to also set *Authorization Flow -> Public Bot : Off* because a MirrorerMachine instance is calibrated for a specific single Discord server.
4. Below the Bot page, Discord provides a Bot Permissions assistant inset. Select the checkboxes of following permissions and copy the number that appears below the inset:
- General permissions
	- Manage Roles
	- Manage Channels
	- View Channels, also known as Read Messages/View Channels
- Text Permissions
	- Send Messages
	- Send Messages In Threads
	- Create Public Threads
	- Embed Links
	- Add Reactions
	- Manage Messages
	- Manage Threads
	- Read Message History
5. Go to the OAuth2 tab just above Bot. Create an authorization URL as follows. Replace [Permissions Integer] with the number you copied in the previous step. Replace [ClientID] with the CLIENT ID Number that can be found in the OAuth2 tab.
`https://discord.com/api/oauth2/authorize?client_id=[ClientID]&permissions=[Permissions Integer]&scope=bot%20applications.commands`
6. Paste the URL created in the previous step into the *Redirects* box in the OAuth2 tab. Save your changes.
7. Paste the URL into a web browser. This will take you to a page asking you which server to add the bot into. Select the server you want to sync with your web forum.

The bot should now appear in the members sidebar of the Discord server, though it will show as being offline. 

Keep the Discord Developer Portal open for the next step.

## Filling in `config.json`
These steps should be carried out on the server or computer that is running your Simple Machines Forum instance.

First, check node.js is installed on your server. 
```
node --version
```

If this gives a command not found error, use the following commands to install node.js. They work for a bash terminal with `wget`, installing node.js via `nvm`, the node version manager:
```
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
source ~/.bashrc
nvm list-remote
```
Choose a version from the list (in the below example, v16.15.0), and install it:
```
cd ~
nvm install v18.15.0
nvm alias default v18.15.0
```


Then, download the code of MirrorerMachine:
```
wget https://github.com/patriotismforstetriol/MirrorerMachine/archive/refs/heads/main.tar.gz \
-O "MirrorerMachine-main.tar.gz" && \
tar -xzvf ./"MirrorerMachine-main.tar.gz" && \
rm ./"MirrorerMachine-main.tar.gz"
```

Navigate to the folder where the code of MirrorerMachine is now located (`cd ~` command above puts it in a folder `MirrorerMachine-main` inside the home directory), and rename the file `template_config.json` to `config.json`.
```
cd MirrorerMachine-main
mv template_config.json config.json
```
Then, open `config.json` and replace the placeholder entries with real information.
- `token`: In the Discord Developer Portal, go to your MirrorerMachine's 'Bot' tab, and click *Reset Token*. Copy the token that appears and paste it in the quotation marks after `"token":`
	- eg `"token": "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",`
	- (A Discord bot's token must remain private. Do not post the token publicly anywhere, and do not share the `config.json` file publicly.)
- `myDiscordId`: 'my' refers to your MirrorerMachine instance itself. In the Discord Developer Portal, go to your MirrorerMachine's 'General Information' tab and copy the *Application Id*. Paste this Application Id in the quotation marks after `"myDiscordId":` 
	- eg. `"myDiscordId": "1000000000000000000",`
- `guildId`: In Discord, open your User Settings -> *App Settings -> Advanced -> Developer Mode : On*. This allows you to see server and message IDs when you right-click. Now, go to the Discord server you will be syncing. Right-click on its title, in the top left of the Discord interface, and click *Copy Id*. Paste this server Id in the quotation marks after `"guildId":` 
	- eg. `"guildId": "1000000000000000000",`
- `guildRegisteredRole`: MirrorerMachine gives Discord users a Discord role when they accept the forum rules by running `/mirrorer_nameme`. This role can be used to stop users from seeing forum channels before they agree to the forum rules. See **Setting up Synchronisation Links**, below.
	- In the Discord server, open Server Settings -> Roles. Go to the @everyone role and make sure *Use Application Commands* is on.
	- Still in Server Settings -> Roles, create a new role for users that are registered with MirrorerMachine. Right-click on the name of this role and copy its role ID.
	- Paste this role Id in the quotation marks after `"guildRegisteredRole":`
	- eg `"guildRegisteredRole": "1000000000000000000",`
- `myDiscordAdmin`: The Discord account that should be contacted about MirrorerMachine will probably be you, the person who is setting it up. Copy your Discord account's ID by right-clicking on your name in the members sidebar of your Discord server and clicking *Copy Id*. Paste this user Id in the quotation marks after `"myDiscordAdmin":` 
	- eg.  `"myDiscordAdmin": "1000000000000000000",`
- `myEmail`: Every message in a Simple Machines Forum records the email address of the user who sent it. MirrorerMachine will record every message posted in the associated Discord forum under its `myEmail` email address. Enter an email address for MirrorerMachine to use for this purpose in the quotation marks after `"myEmail":`  
	- eg. `"myEmail": "someemail@example.com",`
- `dbConfig`: The details needed to connect to the database. [See this MariaDB documentation](https://mariadb.com/kb/en/connector-nodejs-promise-api/#createconnectionoptions-promise). 
	- `user`: When setting up the Simple Machines Forum, you would have created a database user account with a username and password. Paste the username of that database account in the quotation marks after `"user":`
	- `password`: Paste the password of the database account in the quotation marks after `"password":`
		- (This is another reason the `config.json` file should be kept private!)
	- `database`: Paste the title of your Simple Machines Forum database in the quotation marks after `"dbName":`
		- If you did not change this from the default, `"dbName": "forums",`
	- `host`: If MirrorerMachine will be running on a different server to the Simple Machines Forum database, paste the IP address or URL where the Simple Machines Forum database can be found after this option, and delete the `socketPath` entry.
	- `socketPath`: If MirrorerMachine will be running on the same server as the Simple Machines Forum database, open the database and run the SQL command `SHOW VARIABLES LIKE 'socket';`. Paste the output of that command after the `socketPath` option, and delete the `host` option.
	- Examples:
	``` 
	"dbConfig": {
        "host": "example.com",
        "user": "dbuser",
        "password": "Password1",
        "database": "forums"
    },
	```
		or 
	```
	"dbConfig": {
		"socketPath": "/tmp/mysql.sock",
        "user": "dbuser",
        "password": "Password1",
        "database": "forums"
    },
	```
- `dbTablePrefix`: Paste the prefix of the tables of your Simple Machines Forum database in the quotation marks after `"dbTablePrefix":`
	- If you did not change this from the default, `"dbTablePrefix": "smf_"`,
- `forumHostname`: Paste the URL that forum members use to access the Simple Machines Forum in the quotation marks after `"forumHostname":`
	- eg `"forumHostname": "https://example.com/forums/",`
- `"myForumId"`: Register an account for MirrorerMachine to post from on the Simple Machines Forum. Find the forum user ID of this account by (a) looking it up in the database or (b) reading the number after `;u=` in the URL of the account's profile page, if you have not changed the way Simple Machine Forums shows URLs. Paste this user ID into the quotation marks after `"myForumId":`
	- eg `"myForumId": "2",`
- `"forumCheckIntervalms"`: MirrorerMachine will regularly check the Simple Machines Forum for new messages (Discord, on the other hand, will automatically let it know when new messages are posted to the Discord server). Choose the amount of time, in milliseconds, for MirrorerMachine to wait between checks of the forum. Paste this number after `"forumCheckIntervalms":`
	- eg `"forumCheckIntervalms": 3000`
Save the file.

Install the packages and build the database tables that MirrorerMachine depends on:
```
npm install --omit=dev
node prepare-database.js
```

Set up MirrorerMachine's slash commands by running:
```
node deploy-commands.js
```
Once it has deployed all four commands, stop node.js with control-C.

We will use `systemd` to set MirrorerMachine running and have it restart itself if it stops. `systemd` is pre-installed on modern Linux servers.
```
cd /lib/systemd/system
sudo nano ./mirrorermachine.service
```
These commands navigate to `systemd`'s directory and create a new file `mirrorermachine.service`. Paste the following text into the file, replacing ``$user$`` with the name of the account you log into the server with, and making sure the node version number is correct for the version of node.js you have installed:
```
[Unit]
Description=MirrorerMachine - Syncronise conversations between a Discord server and a Simple Machines Forum
Documentation=https://github.com/patriotismforstetriol/MirrorerMachine
After=network.target

[Service]
Environment=NODE_PORT=3001
Type=simple
User=$user$
ExecStart=home/$user$/.nvm/versions/node/v18.15.0/bin/node /home/$user$/MirrorerMachine-main/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
Save the file.

Then run these commands to launch the app:
```
sudo systemctl daemon-reload
sudo systemctl start mirrorermachine
```
To make MirrorerMachine start up every time the machine boots up, run:
```
sudo systemctl enable mirrorermachine
```

Other options, if `systemd` is not available, include node.js packages `forever` and `PM2`. 

The Discord bot should now show as being online in Discord, and MirrorerMachine will be ready to respond to commands and synchronise messages.

# Usage
## Setting up Synchronisation Links
Once set up, you will want to use the `/mirrorer_linkchannel` command in Discord to tell MirrorerMachine which forum board corresponds to which Discord channel. 
- Note: only members with at least Audit Log viewing permissions can use `/mirrorer_linkchannel`. 
- Once a Discord channel is linked to a forum board, MirrorerMachine should copy messages posted to the forum board to the Discord channel, and copy messages posted to the Discord channel to the forum board. 
- MirrorerMachine will react with a globe emoji to messages in the Discord channel that have been synchronised.

You will likely want all of your forum-synchronised Discord channels to not be accessible to members who have not accepted the forum rules and are not registered with MirrorerMachine. 
- Open the Edit Channel menu of the Discord channel or channel category (via the cog icon that appears on hover or the Edit Channel option in the right-click menu). 
- Go to *Permissions*, turn *Private Channel* on, then add the role you created for `guildRegisteredRole` to the list of roles that can see and access the channel. This way it is visible to users who have registered with MirrorerMachine, but invisible to everyone else.

You will want at least one channel that is visible to everyone but that only administrators can send messages in, to be your forum rules channel. Send a message in that channel containing your forum rules, and end it with a sentence like:
```
To agree to the above rules and get access to this forum community, use the /mirrorer_nameme command.
```

## Manual synchronisation
On startup, MirrorerMachine should run through the list of events that have occured since it was last online, and will synchronise them automatically. In the case where Mirrorer has failed to synchronise a message(s), there are two slash commands available to users who have Audit Log permissions:
- `/mirrorer_syncmanually [message link(s)]`: force-synchronises a Discord message or list of Discord messages with the forum.
	- Message links should be of the format "https://discord.com/channels/700000000000000001/700000000000000002/1000000000000000003". This is the format produced when selecting Copy Message Link from the right-click menu of a message. 
- `/mirrorer_syncsincetime [time and date description]`: synchronises all messages sent, updated, or deleted in Simple Machines Forum or Discord server since a given timestamp.
	- `[time and date description]` can be in any format accepted by Javascript's Date() function. eg December 17, 1995 03:24:00

process.on('unhandledRejection', error => console.log(error)); process.on('uncaughtException', error => console.log(error));

const axios = require("axios"); const fs = require("fs-extra"); const google = require("googleapis").google; const nodemailer = require("nodemailer"); const { execSync } = require('child_process'); const log = require('./logger/log.js'); const path = require("path");

process.env.BLUEBIRD_W_FORGOTTEN_RETURN = 0;

function validJSON(pathDir) { try { if (!fs.existsSync(pathDir)) throw new Error(File "${pathDir}" not found); execSync(npx jsonlint "${pathDir}", { stdio: 'pipe' }); return true; } catch (err) { let msgError = err.message.split("\n").slice(1).join("\n"); const indexPos = msgError.indexOf("    at"); msgError = msgError.slice(0, indexPos != -1 ? indexPos - 1 : msgError.length); throw new Error(msgError); } }

const { NODE_ENV } = process.env; const dirConfig = path.normalize(${__dirname}/config${['production', 'development'].includes(NODE_ENV) ? '.dev.json' : '.json'}); const dirConfigCommands = path.normalize(${__dirname}/configCommands${['production', 'development'].includes(NODE_ENV) ? '.dev.json' : '.json'}); const dirAccount = path.normalize(${__dirname}/account${['production', 'development'].includes(NODE_ENV) ? '.dev.txt' : '.txt'});

for (const pathDir of [dirConfig, dirConfigCommands]) { try { validJSON(pathDir); } catch (err) { log.error("CONFIG", Invalid JSON file "${pathDir.replace(__dirname, "")}":\n${err.message.split("\n").map(line =>   ${line}).join("\n")}\nPlease fix it and restart bot); process.exit(0); } }

const config = require(dirConfig); if (config.whiteListMode?.whiteListIds && Array.isArray(config.whiteListMode.whiteListIds)) config.whiteListMode.whiteListIds = config.whiteListMode.whiteListIds.map(id => id.toString()); const configCommands = require(dirConfigCommands);

global.GoatBot = { commands: new Map(), events: new Map(), cooldowns: new Map(), eventRegistered: [], handleSchedule: [], handleReaction: [], handleReply: [], mainPath: process.cwd(), configPath: new String(), startTime: Date.now() - process.uptime() * 1000, // Fixed missing comma commandFilesPath: [], eventCommandsFilesPath: [], aliases: new Map(), onFirstChat: [], onChat: [], onEvent: [], onReply: new Map(), onReaction: new Map(), onAnyEvent: [], config, configCommands, envCommands: {}, envEvents: {}, envGlobal: {}, reLoginBot: function () {}, Listening: null, oldListening: [], callbackListenTime: {}, storage5Message: [], fcaApi: null, botID: null };

global.db = { threadInfo: new Map(), threadData: new Map(), userName: new Map(), userBanned: new Map(), threadBanned: new Map(), commandBanned: new Map(), threadAllowNSFW: [], allUserID: [], allCurrenciesID: [], allThreadID: [], allThreadData: [], allUserData: [], allDashBoardData: [], allGlobalData: [], threadModel: null, userModel: null, dashboardModel: null, globalModel: null, threadsData: null, usersData: null, dashBoardData: null, globalData: null, receivedTheFirstMessage: {} };

global.client = { dirConfig, dirConfigCommands, dirAccount, countDown: {}, cache: {}, database: { creatingThreadData: [], creatingUserData: [], creatingDashBoardData: [], creatingGlobalData: [] }, commandBanned: configCommands.commandBanned };

const utils = require("./utils.js"); global.utils = utils; const { colors } = utils;

global.temp = { createThreadData: [], createUserData: [], createThreadDataError: [], filesOfGoogleDrive: { arraybuffer: {}, stream: {}, fileNames: {} }, contentScripts: { cmds: {}, events: {} } };

const watchAndReloadConfig = (dir, type, prop, logName) => { let lastModified = fs.statSync(dir).mtimeMs; let isFirstModified = true;

fs.watch(dir, (eventType) => {
    if (eventType === type) {
        const oldConfig = global.GoatBot[prop];

        setTimeout(() => {
            try {
                if (isFirstModified) {
                    isFirstModified = false;
                    return;
                }
                if (lastModified === fs.statSync(dir).mtimeMs) {
                    return;
                }
                global.GoatBot[prop] = JSON.parse(fs.readFileSync(dir, 'utf-8'));
                log.success(logName, `Reloaded ${dir.replace(process.cwd(), "")}`);
            }
            catch (err) {
                log.warn(logName, `Can't reload ${dir.replace(process.cwd(), "")}`);
                global.GoatBot[prop] = oldConfig;
            }
            finally {
                lastModified = fs.statSync(dir).mtimeMs;
            }
        }, 200);
    }
});

};



watchAndReloadConfig(dirConfigCommands, 'change', 'configCommands', 'CONFIG COMMANDS');
watchAndReloadConfig(dirConfig, 'change', 'config', 'CONFIG');

global.GoatBot.envGlobal = global.GoatBot.configCommands.envGlobal;
global.GoatBot.envCommands = global.GoatBot.configCommands.envCommands;
global.GoatBot.envEvents = global.GoatBot.configCommands.envEvents;

// ———————————————— LOAD LANGUAGE ———————————————— //
const getText = global.utils.getText;

// ———————————————— AUTO RESTART ———————————————— //
if (config.autoRestart) {
	const time = config.autoRestart.time;
	if (!isNaN(time) && time > 0) {
		utils.log.info("AUTO RESTART", getText("Goat", "autoRestart1", utils.convertTime(time, true)));
		setTimeout(() => {
			utils.log.info("AUTO RESTART", "Restarting...");
			process.exit(2);
		}, time);
	}
	else if (typeof time == "string" && time.match(/^((((\d+,)+\d+|(\d+(\/|-|#)\d+)|\d+L?|\*(\/\d+)?|L(-\d+)?|\?|[A-Z]{3}(-[A-Z]{3})?) ?){5,7})$/gmi)) {
		utils.log.info("AUTO RESTART", getText("Goat", "autoRestart2", time));
		const cron = require("node-cron");
		cron.schedule(time, () => {
			utils.log.info("AUTO RESTART", "Restarting...");
			process.exit(2);
		});
	}
}

(async () => {
	// ———————————————— SETUP MAIL ———————————————— //
	const { gmailAccount } = config.credentials;
	const { email, clientId, clientSecret, refreshToken } = gmailAccount;
	const OAuth2 = google.auth.OAuth2;
	const OAuth2_client = new OAuth2(clientId, clientSecret);
	OAuth2_client.setCredentials({ refresh_token: refreshToken });
	let accessToken;
	try {
		accessToken = await OAuth2_client.getAccessToken();
	}
	catch (err) {
		throw new Error(getText("Goat", "googleApiTokenExpired"));
	}
	const transporter = nodemailer.createTransport({
		host: 'smtp.gmail.com',
		service: 'Gmail',
		auth: {
			type: 'OAuth2',
			user: email,
			clientId,
			clientSecret,
			refreshToken,
			accessToken
		}
	});

	async function sendMail({ to, subject, text, html, attachments }) {
		const transporter = nodemailer.createTransport({
			host: 'smtp.gmail.com',
			service: 'Gmail',
			auth: {
				type: 'OAuth2',
				user: email,
				clientId,
				clientSecret,
				refreshToken,
				accessToken
			}
		});
		const mailOptions = {
			from: email,
			to,
			subject,
			text,
			html,
			attachments
		};
		const info = await transporter.sendMail(mailOptions);
		return info;
	}

	global.utils.sendMail = sendMail;
	global.utils.transporter = transporter;

	// ———————————————— CHECK VERSION ———————————————— //
	const { data: { version } } = await axios.get("https://raw.githubusercontent.com/ntkhang03/Goat-Bot-V2/main/package.json");
	const currentVersion = require("./package.json").version;
	if (compareVersion(version, currentVersion) === 1)
		utils.log.master("NEW VERSION", getText(
			"Goat",
			"newVersionDetected",
			colors.gray(currentVersion),
			colors.hex("#eb6a07", version),
			colors.hex("#eb6a07", "node update")
		));
	// —————————— CHECK FOLDER GOOGLE DRIVE —————————— //
	const parentIdGoogleDrive = await utils.drive.checkAndCreateParentFolder("GoatBot");
	utils.drive.parentID = parentIdGoogleDrive;
	// ———————————————————— LOGIN ———————————————————— //
	require(`./bot/login/login${NODE_ENV === 'development' ? '.dev.js' : '.js'}`);
})();

function compareVersion(version1, version2) {
	const v1 = version1.split(".");
	const v2 = version2.split(".");
	for (let i = 0; i < 3; i++) {
		if (parseInt(v1[i]) > parseInt(v2[i]))
			return 1; // version1 > version2
		if (parseInt(v1[i]) < parseInt(v2[i]))
			return -1; // version1 < version2
	}
	return 0; // version1 = version2
}

// প্রয়োজনীয় ফাইল ইম্পোর্ট করা
const autoReply = require('./func/autoReply');

// মেসেজ ইভেন্ট পরিচালনা করা
client.on('message', (message) => {
  // যদি মেসেজ নিজের অ্যাকাউন্ট থেকে হয়, তবে কিছু না করা
  if (message.senderID === client.userID) return;

  // অটো রিপ্লাই ফাংশন কল করা
  const reply = autoReply(message.body);
  if (reply) { // যদি রিপ্লাই মেলে
    client.sendMessage(reply, message.threadID); // রিপ্লাই মেসেজ পাঠানো
  }
});

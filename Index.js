const express = require('express');
const axios = require('axios');
const noblox = require('noblox.js');
const RANK_KEY = process.env.RANK_KEY;
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, Partials } = require('discord.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1369390571176853616';
const GROUP_ID = 33238106;
const PROMOTE_KEY = process.env.PROMOTE_KEY;



const DISCORD_CHANNEL_ID = '1381715482972786800';
const ERROR_REPORT_CHANNEL_ID = '1382461283319812250';
const CALL_LOG_CHANNEL_ID = "1454166078459478116";

// 🧠 Profile cache (username -> embed)
const profileCache = new Map();


const validKeys = [
  process.env.PROMOTE_KEY_MAIN,
  process.env.PROMOTE_KEY_RANKER
];

const RELAY_FROM_CHANNEL = '1377489585386557450';
const RELAY_TO_CHANNEL = '1168612120510861352';


// 💜 Kingdom join tracking
const kingdomJoinDates = {};

const userData = {};
app.use(express.json());

app.get("/access-reset-status", (req, res) => {
  res.json({ resetAt: lastAccessReset });
});


let latestMessage = null;
let lastAccessReset = 0;


// 🌍 Health
app.get('/', (req, res) => res.send("✅ Proxy server is online."));
app.get('/health', (req, res) => res.status(200).json({ status: "online", time: new Date().toISOString() }));

const fs = require("fs");
const path = require("path");

(async () => {
  try {
    const cookiePath = path.join(__dirname, "roblox.cookie");

    if (!fs.existsSync(cookiePath)) {
      console.error("❌ roblox.cookie file not found");
      return;
    }

    const cookie = fs.readFileSync(cookiePath, "utf8").trim();
    console.log("👀 Loaded cookie from file:", cookie.startsWith("_|WARNING"));

    const user = await noblox.setCookie(cookie);
    console.log(`✅ Logged in to Roblox as: ${user.UserName || user.name}`);
  } catch (err) {
    console.error("❌ Roblox login failed:", err.message);
  }
})();



// 🔁 ACCESS RESET ENDPOINT (used by Discord + Roblox polling)
app.post("/access-reset", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== RANK_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  lastAccessReset = Date.now();
  console.log("🧹 Weekly access reset triggered");

  // Reset Replit memory cache
  for (const id in userData) {
    userData[id].minutes = 0;
  }

  res.status(200).json({
    success: true,
    resetAt: lastAccessReset
  });
});

// 🕒 Roblox polls this to detect reset
app.get("/access-reset-status", (req, res) => {
  res.json({ resetAt: lastAccessReset });
});


// 📋 Group Members
app.get('/group-members', async (req, res) => {
  try {
    const response = await axios.get(`https://groups.roblox.com/v1/groups/${GROUP_ID}/roles`);
    const roles = response.data.roles.filter(role => role.rank >= 13);
    let members = [];
    for (const role of roles) {
      try {
        const usersRes = await axios.get(`https://groups.roblox.com/v1/groups/${GROUP_ID}/roles/${role.id}/users?limit=100`);
        usersRes.data.data.forEach(user => {
          members.push({
            user: { userId: user.userId, username: user.username },
            role: { name: role.name, rank: role.rank }
          });
        });
      } catch (e) {
        console.warn(`⚠️ Failed fetching users for ${role.name}:`, e.message);
      }
    }
    res.status(200).json({ data: members });
  } catch (err) {
    res.status(500).send("Failed to fetch group members");
  }
});

// 🕒 Minutes Receiver
app.post('/receive-data', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).send("Expected array");
  data.forEach(p => {
    userData[p.UserId] = {
      username: p.Username,
      role: p.Role || 'Unknown',
      minutes: p.Minutes
    };
  });
  console.log("✅ Access data updated.");
  res.sendStatus(200);
});



// 🔁 Message Polling
app.get('/get-message', (req, res) => {
  if (!latestMessage) return res.status(204).send();
  const now = Date.now();
  if (now - latestMessage.timestamp > 15000) {
    latestMessage = null;
    return res.status(204).send();
  }
  return res.status(200).json(latestMessage);
});

// 🤖 Discord Bot Setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'Watching over Sponges Kingdom!', type: 3 }],
    status: 'online'
  });
});

// 🔧 Slash Command Registration
const commands = [
  new SlashCommandBuilder().setName('profile')
    .setDescription('View Roblox profile info')
    .addStringOption(o => o.setName('username').setDescription('Roblox username').setRequired(true)),

  new SlashCommandBuilder().setName('accesscheck')
    .setDescription('Generate weekly access report'),

  new SlashCommandBuilder().setName('accessreset')
    .setDescription('Reset weekly access minutes (King only)'),

  new SlashCommandBuilder().setName('meow').setDescription('Replies with Meow! 🐱'),
  new SlashCommandBuilder().setName('stormy').setDescription('Replies with Stormy says hi! ⛈️'),
  new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong! 🏓'),

  new SlashCommandBuilder().setName('servermessage')
    .setDescription('Send red alert server message to game')
    .addStringOption(o => o.setName('message').setDescription('Message to send to the game').setRequired(true))
].map(cmd => cmd.toJSON());

// ✅ REST MUST BE DEFINED FIRST
const rest = new REST({ version: '10' }).setToken(TOKEN);

// ✅ THEN REGISTER
(async () => {
  try {
    console.log("🔁 Registering slash commands...");
    console.log("Commands being registered:", commands.map(c => c.name));
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log("✅ Slash commands loaded.");
  } catch (err) {
    console.error("❌ Slash command error:", err);
  }
})();





// 🧠 Interaction Handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  if (cmd === 'accesscheck') {
    if (interaction.channelId !== '1377492854984802424') {
      return interaction.reply({ content: '🚫 Use this only in access reports channel.', ephemeral: true });
    }
    await interaction.deferReply();
    const arr = Object.values(userData);
    if (arr.length === 0) return interaction.editReply('📅 **Weekly Access Report**\n\nNo data available.');
    const lines = arr.map(u => {
      const emoji = (u.minutes || 0) >= 180 ? '✅' : '❌';
      return `${emoji} ${u.username} — ${u.role} — ${u.minutes || 0} mins`;
    });
    const week = new Date().toLocaleDateString();
    await interaction.editReply(`📅 **Weekly Access Report — Week of ${week}**\n\n${lines.join('\n')}`);
    return;
  }

  if (cmd === "accessreset") {
    const KING_ROLE_ID = "1168585612425703475"; // your king role

    if (!interaction.member.roles.cache.has(KING_ROLE_ID)) {
      return interaction.reply({
        content: "👑 Only the King may use this command.",
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await axios.post(
        "https://entire-perch-stormydacat-135cae8e.koyeb.app/access-reset",
        {},
        {
          headers: {
            "x-api-key": process.env.RANK_KEY
          }
        }
      );

      await interaction.editReply("🧹 **Weekly access minutes have been fully reset.**");
    } catch (err) {
      console.error("❌ Access reset failed:", err);
      await interaction.editReply("❌ Failed to reset access minutes.");
    }

    return;
  }




  if (cmd === 'meow') return interaction.reply('Meow! 🐱');
  if (cmd === 'stormy') return interaction.reply('Stormy says hi! ⛈️');
  if (cmd === 'ping') return interaction.reply('🏓 Pong! I\'m alive!');

  if (cmd === 'servermessage') {
    if (interaction.channelId !== '1379191514013630526') {
      return interaction.reply({ content: '🚫 Use this command only in the designated channel.', ephemeral: true });
    }
    const msg = interaction.options.getString('message')?.trim();
    if (!msg) return interaction.reply({ content: '❌ You must provide a message.', ephemeral: true });

    const VERIFIED_ROLE_ID = '1168612741683105872';
    const member = interaction.member;
    let sender = interaction.user.username;
    if (member.roles.cache.has(VERIFIED_ROLE_ID) && member.nickname) sender = member.nickname;

    latestMessage = {
      msg,
      sender,
      color: 'red',
      duration: 10,
      timestamp: Date.now()
    };

    console.log(`[📢 DISCORD] Red alert triggered by ${sender}: "${msg}"`);

    await interaction.reply({
      embeds: [{ title: '🟥 Red Alert Message Sent', description: msg, color: 0xFF0000 }]
    });
    return;
  }


  if (cmd === 'profile') {
    await interaction.deferReply();
    const input = interaction.options.getString('username');
    const fallback = interaction.member?.nickname || interaction.user.username;
    const robloxUsername = input || fallback;

    const cacheKey = robloxUsername.toLowerCase();
    const cached = profileCache.get(cacheKey);
    const now = Date.now();

    // ✅ Use cached embed if fresh (30 sec)
      if (cached && now - cached.timestamp < 30000) {
        console.log(`⚡ Using cached profile for ${robloxUsername}`);
        return interaction.editReply({ embeds: [cached.embed] });
      }


    try {
      const robloxId = await noblox.getIdFromUsername(robloxUsername);
      
      const [robloxUser, rankName, thumbRes, userRes] = await Promise.all([
        noblox.getUserInfo(robloxId),
        noblox.getRankNameInGroup(GROUP_ID, robloxId),
        axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=720x720&format=Png&isCircular=false`),
        axios.get(`https://users.roblox.com/v1/users/${robloxId}`)
      ]);

      const headshotUrl = thumbRes.data.data[0]?.imageUrl || null;
      const bio = userRes.data.description || "*No bio/about me set.*";


      const joinDate = new Date(robloxUser.created).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      const ageDays = `${Math.floor((Date.now() - new Date(robloxUser.created)) / (1000 * 60 * 60 * 24))} days`;

      const embed = {
        color: 0x8A2BE2,
        title: `👑 Kingdom Profile`,
        thumbnail: { url: headshotUrl },
        fields: [
          { name: '🏰 Username', value: robloxUser.username || robloxUsername, inline: true },
          { name: '🆔 Roblox ID', value: `${robloxId}`, inline: true },
          { name: '🎭 Display Name', value: robloxUser.displayName || 'N/A', inline: true },
          { name: '📅 Join Date', value: joinDate, inline: true },
          { name: '📆 Account Age', value: ageDays, inline: true },
          { name: '🎖️ Group Rank', value: rankName || 'Guest', inline: true },
          { name: '🔗 Profile', value: `[View Profile](https://www.roblox.com/users/${robloxId}/profile)`, inline: false },
          { name: '📝 Bio / About Me', value: bio.length > 1024 ? bio.slice(0, 1021) + '...' : bio, inline: false }
        ],
        footer: { text: 'Sponges Kingdom Identification System 🏰' },
        timestamp: new Date()
      };

        profileCache.set(cacheKey, {
          embed,
          timestamp: now
        });



      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error("❌ Command failed:", err);
      await interaction.editReply({
        content: "❌ Command failed — Please try again now or later.",
        ephemeral: true
      });
    }
  }



    return;
});

// 💬 MessageCreate Handler
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.channel.type === 1) {
    const reply = `Hi There Fellow Worker! 🐾

Unfortunately, I am a bot and I can not have a normal conversation although I do speak in Sponges Kingdom! 🏰

If you haven't already, Please Join Sponges Kingdom today! 
💜 https://discord.gg/fV7NJ8uqwY 💜

Have a nice day! 😸`;
    return message.reply(reply).catch(console.error);
  }

  if (message.guild && message.channel.id === RELAY_FROM_CHANNEL) {
    try {
      const relayChannel = await client.channels.fetch(RELAY_TO_CHANNEL);
      if (relayChannel) await relayChannel.send(message.content);
    } catch (err) {
      console.error("❌ Relay failed:", err);
    }
  }
});

// 🆕 Jail Log Receiver
app.post('/jail-log', async (req, res) => {
  try {
    const { action, target, issuer, duration, reason } = req.body;
    const channel = await client.channels.fetch("1404996549913612448");

    if (!channel) {
      console.error("❌ Jail log channel not found");
      return res.sendStatus(500);
    }

    let description = "";
    if (action === "jail") {
      description = `**${issuer}** has arrested **${target}** for **${duration} minute(s)**.\n📌 Reason: ${reason || "None"}`;
    } else if (action === "release") {
      description = `**${issuer}** has released **${target}** from jail.`;
    }

    await channel.send({
      embeds: [{
        title: action === "jail" ? "🚔 Jail Action" : "🔓 Release Action",
        description,
        color: action === "jail" ? 0xFF0000 : 0x00FF00,
        timestamp: new Date()
      }]
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Jail log error:", err);
    res.sendStatus(500);
  }
});

// 📜 Roblox Command Log Receiver
app.post('/roblox-log', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).send("Missing message field");

    const channel = await client.channels.fetch("1395512388610166784");
    if (!channel) {
      console.error("❌ Command log channel not found");
      return res.sendStatus(500);
    }

    await channel.send({
      embeds: [{
        title: "📜 Roblox Command Log",
        description: message,
        color: 0x3498db,
        timestamp: new Date()
      }]
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Roblox log error:", err);
    res.sendStatus(500);
  }
});



// ✅ Promotion Endpoint
app.post('/promote', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!validKeys.includes(apiKey)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  const { userId, username, promoter } = req.body;
  if (!userId || !username || !promoter) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const currentRank = await noblox.getRankInGroup(GROUP_ID, Number(userId));
    if (currentRank !== 1) {
      return res.status(400).json({ error: `User is not a Recruit (current rank: ${currentRank})` });
    }
    await noblox.setRank(GROUP_ID, Number(userId), 2);
    console.log(`✅ Promoted ${username} by ${promoter}`);
    // ✅ Send to Discord
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    if (channel) {
      await channel.send({
        embeds: [{
          title: '✅ Player Promoted',
          color: 0x00FF00,
          fields: [
            { name: 'Promoter', value: promoter, inline: true },
            { name: 'Target', value: username, inline: true },
            { name: 'New Rank', value: 'Receptionist (2)', inline: true }
          ],
          timestamp: new Date()
        }]
      });
    }
    return res.status(200).json({ message: 'Promotion successful' });
  } catch (err) {
    console.error("❌ Promotion error:", err);
    // 🟥 Send to error channel
    try {
      const errorChannel = await client.channels.fetch(ERROR_REPORT_CHANNEL_ID);
      if (errorChannel) {
        await errorChannel.send({
          embeds: [{
            title: '🚨 Promotion Failed',
            color: 0xFF0000,
            fields: [
              { name: 'Promoter', value: promoter || 'Unknown', inline: true },
              { name: 'Target', value: username || 'Unknown', inline: true },
              { name: 'Error', value: `\`\`\`${err.message}\`\`\`` }
            ],
            timestamp: new Date()
          }]
        });
      }
    } catch (reportErr) {
      console.error("❌ Failed to send error report:", reportErr.message);
    }
    return res.status(500).json({ error: 'Promotion failed', details: err.message });
  }
});

// ✅ RANK COMMAND ENDPOINT (with Discord log)
app.post("/rank", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== RANK_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  const { username, rank, promoter } = req.body;
  if (!username || !rank || !promoter) {
    return res.status(400).json({ error: "Missing username, rank, or promoter" });
  }

  // 🚫 NEW RULE: Block rank 5 (VIP)
  if (rank === 5) {
    return res.status(403).json({ error: "You cannot promote anyone to rank 5 (VIP)." });
  }

  try {
    const userId = await noblox.getIdFromUsername(username);
    const promoterId = await noblox.getIdFromUsername(promoter);

    const currentRank = await noblox.getRankInGroup(GROUP_ID, userId);
    const promoterRank = await noblox.getRankInGroup(GROUP_ID, promoterId);
    const roles = await noblox.getRoles(GROUP_ID);
    const newRole = roles.find(r => r.rank === rank);

    if (promoterRank < 10) {
      return res.status(403).json({ error: "You must be rank 10+ to use this command." });
    }
    if (promoterRank < 13 && rank >= 13) {
      return res.status(403).json({ error: "You cannot promote someone to rank 13+." });
    }
    if (rank <= currentRank) {
      return res.status(400).json({ error: "You can only promote (new rank must be higher)." });
    }

    // 🧩 NEW RULES (already there)
    if (rank >= 13 && rank <= 15 && promoterRank < 17) {
      return res.status(403).json({ error: "You must be rank 17+ to promote someone to 13–15." });
    }
    if (rank >= promoterRank) {
      return res.status(403).json({ error: "You cannot promote someone to a rank equal to or higher than yours." });
    }

    await noblox.setRank(GROUP_ID, userId, rank);
    console.log(`✅ ${promoter} ranked ${username} to ${rank}`);

    // 🟪 Send Discord embed log
    try {
      const logChannel = await client.channels.fetch("1381715482972786800");
      if (logChannel) {
        const newRoleName = newRole ? newRole.name : `Rank ${rank}`;
        await logChannel.send({
          embeds: [
            {
              title: "📜 Rank Log",
              description: `**${promoter}** ranked **${username}** to **${newRoleName}!**`,
              color: 0x6A5ACD,
              timestamp: new Date(),
              footer: { text: "Sponges Kingdom Rank System 🏰" }
            }
          ]
        });
      } else {
        console.warn("⚠️ Could not find Discord channel for rank logs.");
      }
    } catch (discordErr) {
      console.error("❌ Failed to send Discord rank log:", discordErr);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully ranked ${username} to ${rank}.`
    });
  } catch (err) {
    console.error("❌ Rank API error:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// 📞 Roblox Call / Uncall Logger
app.post("/roblox-call-log", async (req, res) => {
  try {
    const { type, username, userId, rank, jobId } = req.body;

    // 🧼 Basic validation
    if (
      !type ||
      !username ||
      typeof username !== "string" ||
      (type !== "call" && type !== "uncall")
    ) {
      return res.status(400).send("Invalid payload");
    }

    const channel = await client.channels.fetch(CALL_LOG_CHANNEL_ID);
    if (!channel) {
      console.error("❌ Call log channel not found");
      return res.sendStatus(500);
    }

    const isCall = type === "call";

    await channel.send({
      embeds: [
        {
          title: isCall ? "📞 Call Started" : "📴 Call Ended",
          color: isCall ? 0xE74C3C : 0x2ECC71,
          fields: [
            { name: "👤 User", value: username, inline: true },
            { name: "🎖 Rank", value: rank || "Unknown", inline: true },
            { name: "🆔 User ID", value: String(userId || "N/A"), inline: true },
            { name: "🖥 Server JobId", value: `\`${jobId || "Unknown"}\`` }
          ],
          footer: { text: "Kingdom Call System" },
          timestamp: new Date()
        }
      ]
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Call log error:", err);
    res.sendStatus(500);
  }
});


// 🟢 Health Check
app.listen(process.env.PORT || 3000, () => console.log("🌐 Server is live"));

client.login(TOKEN);

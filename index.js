const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const http = require('http');
require('dotenv').config();

// Servidor HTTP para manter o bot online no Render
http.createServer((req, res) => {
    res.write("Bot de Musica Blindado Online!");
    res.end();
}).listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Configuração do Player (Discord-Player é mais estável no Render)
const player = new Player(client, {
    ytdlOptions: {
        quality: 'highestaudio',
        highWaterMark: 1 << 25
    }
});

// Carregar extratores (YouTube, Spotify, etc)
player.extractors.loadDefault();

// Definição dos Comandos
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 Toca uma música ou link.')
        .addStringOption(option => option.setName('busca').setDescription('Nome ou link da música').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('⏭️ Pula para a próxima música.'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('⏹️ Para a música e sai da call.'),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🎶 Bot de Música logado como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos registrados!');
    } catch (error) { console.error(error); }
});

// Eventos do Player
player.events.on('playerStart', (queue, track) => {
    const embed = new EmbedBuilder()
        .setTitle('🎶 Tocando Agora')
        .setDescription(`**[${track.title}](${track.url})**`)
        .setThumbnail(track.thumbnail)
        .setColor('#00FF00')
        .setFooter({ text: `Duração: ${track.duration}` });
    queue.metadata.channel.send({ embeds: [embed] });
});

player.events.on('error', (queue, error) => {
    console.log(`[Erro na Fila] ${error.message}`);
});

player.events.on('playerError', (queue, error) => {
    console.log(`[Erro no Player] ${error.message}`);
    queue.metadata.channel.send('❌ Erro ao processar áudio. O YouTube pode estar bloqueando a conexão.');
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, guild } = interaction;

    if (!member.voice.channel) {
        return interaction.reply({ content: '❌ Você precisa estar em um canal de voz!', ephemeral: true });
    }

    if (commandName === 'play') {
        await interaction.deferReply();
        const query = options.getString('busca');
        
        try {
            const { track } = await player.play(member.voice.channel, query, {
                nodeOptions: {
                    metadata: { channel: interaction.channel }
                }
            });
            await interaction.editReply(`✅ Adicionado à fila: **${track.title}**`);
        } catch (e) {
            console.error(e);
            await interaction.editReply(`❌ Não foi possível tocar: ${e.message}`);
        }
    }

    if (commandName === 'skip') {
        const queue = player.nodes.get(guild.id);
        if (!queue || !queue.isPlaying()) return interaction.reply({ content: '❌ Não há nada tocando!', ephemeral: true });
        queue.node.skip();
        interaction.reply('⏭️ Música pulada!');
    }

    if (commandName === 'stop') {
        const queue = player.nodes.get(guild.id);
        if (!queue) return interaction.reply({ content: '❌ Não há nada tocando!', ephemeral: true });
        queue.delete();
        interaction.reply('⏹️ Música parada e bot desconectado!');
    }
});

client.login(process.env.TOKEN);

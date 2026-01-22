const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require('discord.js');
const { Player, QueryType } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const playdl = require('play-dl');
const http = require('http');
require('dotenv').config();

// Servidor HTTP para manter o bot online no Render
http.createServer((req, res) => {
    res.write("Bot de Musica Camuflado Online!");
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

// Configuração do Player
const player = new Player(client);

// Carregar extratores manualmente para ter mais controle
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

player.events.on('playerError', (queue, error) => {
    console.log(`[Erro no Player] ${error.message}`);
    queue.metadata.channel.send('❌ Erro ao processar áudio. Tentando pular...');
    queue.node.skip();
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
            // Forçar busca via YouTube para evitar erros de extratores de terceiros (Spotify/Apple)
            const searchResult = await player.search(query, {
                requestedBy: interaction.user,
                searchEngine: query.includes('youtube.com') || query.includes('youtu.be') ? QueryType.YOUTUBE_VIDEO : QueryType.YOUTUBE_SEARCH
            });

            if (!searchResult || !searchResult.tracks.length) {
                return interaction.editReply('❌ Nenhuma música encontrada para sua busca.');
            }

            const { track } = await player.play(member.voice.channel, searchResult, {
                nodeOptions: {
                    metadata: { channel: interaction.channel },
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 30000,
                    leaveOnEnd: false,
                    selfDeaf: true,
                }
            });

            await interaction.editReply(`✅ Adicionado à fila: **${track.title}**`);
        } catch (e) {
            console.error(e);
            await interaction.editReply(`❌ Erro: O YouTube bloqueou a conexão. Tente novamente em instantes.`);
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

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes, 
    SlashCommandBuilder 
} = require('discord.js');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const http = require('http');
require('dotenv').config();

// Servidor HTTP para manter o bot online no Render
http.createServer((req, res) => {
    res.write("Bot de Música Online!");
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

// Configuração do DisTube
client.distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    plugins: [
        new YouTubePlugin(),
        new SpotifyPlugin()
    ]
});

// Definição dos Comandos
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 Toca uma música ou playlist.')
        .addStringOption(option => option.setName('busca').setDescription('Nome ou link da música/playlist').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('⏭️ Pula para a próxima música.'),

    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('⏹️ Para a música e limpa a fila.'),

    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('📜 Mostra a fila de músicas atual.'),

    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('🔊 Ajusta o volume do bot.')
        .addIntegerOption(option => option.setName('nivel').setDescription('Volume de 1 a 100').setRequired(true)),
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`🎶 Bot de Música logado como ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comandos de música registrados!');
    } catch (error) {
        console.error(error);
    }
});

// Eventos do DisTube
client.distube
    .on('playSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setTitle('🎶 Tocando Agora')
            .setDescription(`**[${song.name}](${song.url})**`)
            .addFields(
                { name: 'Duração', value: `\`${song.formattedDuration}\``, inline: true },
                { name: 'Pedido por', value: `${song.user}`, inline: true }
            )
            .setThumbnail(song.thumbnail)
            .setColor('#00FF00');
        queue.textChannel.send({ embeds: [embed] });
    })
    .on('addSong', (queue, song) => {
        queue.textChannel.send(`✅ Adicionado à fila: **${song.name}** - \`${song.formattedDuration}\``);
    })
    .on('error', (channel, e) => {
        if (channel) channel.send(`❌ Ocorreu um erro: ${e.message.slice(0, 100)}`);
        console.error(e);
    });

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, guild, channel } = interaction;

    if (!member.voice.channel) {
        return interaction.reply({ content: '❌ Você precisa estar em um canal de voz!', ephemeral: true });
    }

    if (commandName === 'play') {
        await interaction.reply({ content: '🔍 Buscando música...', ephemeral: true });
        const query = options.getString('busca');
        client.distube.play(member.voice.channel, query, {
            member: member,
            textChannel: channel,
            interaction
        });
    }

    if (commandName === 'skip') {
        const queue = client.distube.getQueue(guild);
        if (!queue) return interaction.reply({ content: '❌ Não há nada tocando!', ephemeral: true });
        try {
            await client.distube.skip(guild);
            interaction.reply('⏭️ Música pulada!');
        } catch (e) {
            interaction.reply('❌ Não há mais músicas na fila.');
        }
    }

    if (commandName === 'stop') {
        const queue = client.distube.getQueue(guild);
        if (!queue) return interaction.reply({ content: '❌ Não há nada tocando!', ephemeral: true });
        client.distube.stop(guild);
        interaction.reply('⏹️ Música parada e fila limpa!');
    }

    if (commandName === 'queue') {
        const queue = client.distube.getQueue(guild);
        if (!queue) return interaction.reply({ content: '❌ A fila está vazia!', ephemeral: true });
        const q = queue.songs.map((song, i) => `${i === 0 ? 'Playing:' : `${i}.`} ${song.name} - \`${song.formattedDuration}\``).join('\n');
        interaction.reply(`📜 **Fila Atual:**\n${q.slice(0, 2000)}`);
    }

    if (commandName === 'volume') {
        const volume = options.getInteger('nivel');
        if (volume < 1 || volume > 100) return interaction.reply({ content: '❌ Escolha um volume entre 1 e 100.', ephemeral: true });
        client.distube.setVolume(guild, volume);
        interaction.reply(`🔊 Volume ajustado para **${volume}%**`);
    }
});

client.login(process.env.TOKEN);

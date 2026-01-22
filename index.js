const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
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
    res.write("Bot de Musica Estavel Online!");
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

// Configuração do DisTube - Focada em estabilidade
client.distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    leaveOnEmpty: true,
    nsfw: true, // Ajuda a evitar bloqueios de idade
    plugins: [
        new YouTubePlugin(),
        new SpotifyPlugin()
    ]
});

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

// Eventos do DisTube
client.distube
    .on('playSong', (queue, song) => {
        const embed = new EmbedBuilder()
            .setTitle('🎶 Tocando Agora')
            .setDescription(`**[${song.name}](${song.url})**`)
            .setThumbnail(song.thumbnail)
            .setColor('#00FF00')
            .addFields(
                { name: 'Duração', value: `\`${song.formattedDuration}\``, inline: true },
                { name: 'Pedido por', value: `${song.user}`, inline: true }
            );
        queue.textChannel.send({ embeds: [embed] });
    })
    .on('addSong', (queue, song) => {
        queue.textChannel.send(`✅ Adicionado à fila: **${song.name}**`);
    })
    .on('error', (channel, e) => {
        console.error(e);
        if (channel) channel.send(`❌ Erro: O YouTube bloqueou esta música. Tente outra ou use um link direto.`);
    });

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member, guild, channel } = interaction;

    if (!member.voice.channel) {
        return interaction.reply({ content: '❌ Você precisa estar em um canal de voz!', ephemeral: true });
    }

    if (commandName === 'play') {
        await interaction.reply({ content: '🔍 Buscando... Aguarde.', ephemeral: true });
        const query = options.getString('busca');
        
        try {
            await client.distube.play(member.voice.channel, query, {
                member: member,
                textChannel: channel,
                interaction
            });
        } catch (e) {
            console.error(e);
            await interaction.editReply({ content: '❌ Não foi possível carregar a música. Tente novamente.' });
        }
    }

    if (commandName === 'skip') {
        const queue = client.distube.getQueue(guild);
        if (!queue) return interaction.reply({ content: '❌ Não há nada tocando!', ephemeral: true });
        try {
            await client.distube.skip(guild);
            interaction.reply('⏭️ Música pulada!');
        } catch (e) { interaction.reply('❌ Não há mais músicas na fila.'); }
    }

    if (commandName === 'stop') {
        const queue = client.distube.getQueue(guild);
        if (!queue) return interaction.reply({ content: '❌ Não há nada tocando!', ephemeral: true });
        client.distube.stop(guild);
        interaction.reply('⏹️ Música parada!');
    }
});

client.login(process.env.TOKEN);

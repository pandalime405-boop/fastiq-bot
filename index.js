require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const cron = require('node-cron');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const channelId = process.env.CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});

// 🧾 Список авто
let cars = [
  { name: 'Scania R730 #1', free: true },
  { name: 'Scania R730 #2', free: true },
  { name: 'Scania R730 #3', free: true },
  { name: 'Scania R730 #4', free: true },
  { name: 'Scania R730 #5', free: true },
  { name: 'Freightliner Century #1', free: true },
  { name: 'Freightliner Century #2', free: true },
  { name: 'Freightliner Century #3', free: true },
];

// 🧩 Команди
const commands = [
  new SlashCommandBuilder()
    .setName('бронь')
    .setDescription('Відкрити систему бронювання авто FASTIQ Logistics'),
  new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Скинути всі бронювання (для адміністратора)')
].map(cmd => cmd.toJSON());

// 📦 Реєстрація команд
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log('🛠 Реєстрація команд...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Slash-команди зареєстровані!');
  } catch (error) {
    console.error('❌ Помилка при реєстрації команд:', error);
  }
})();

// 🧱 Формування embed + кнопки
function getCarList() {
  const embed = new EmbedBuilder()
    .setTitle('🚛 FASTIQ Logistics — Система бронювання авто')
    .setDescription('Натисни кнопку, щоб забронювати або звільнити фуру.')
    .setColor('#00AAFF');

  const desc = cars.map(car =>
    `${car.free ? '🟢 **Вільна**' : `🔴 **Зайнята** (${car.userTag})`} — ${car.name}`
  ).join('\n');
  embed.addFields({ name: 'Статус авто:', value: desc });

  const rows = [];
  for (let i = 0; i < cars.length; i += 5) {
    const row = new ActionRowBuilder();
    cars.slice(i, i + 5).forEach((car, index) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`car_${i + index}`)
          .setLabel(car.name.split(' ')[0])
          .setStyle(car.free ? ButtonStyle.Success : ButtonStyle.Secondary)
      );
    });
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

// 🔹 Події
client.once('ready', () => {
  console.log(`✅ Увійшов як ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // 📦 /бронь
  if (interaction.isChatInputCommand() && interaction.commandName === 'бронь') {
    await interaction.reply(getCarList());
  }

  // ♻️ /reset
  if (interaction.isChatInputCommand() && interaction.commandName === 'reset') {
    cars.forEach(c => {
      c.free = true;
      c.userId = null;
      c.userTag = null;
    });
    await interaction.reply({ content: '🔄 Усі авто знову вільні!', ephemeral: true });
  }

  // 🚗 Клік по кнопці
  if (interaction.isButton()) {
    const index = parseInt(interaction.customId.split('_')[1]);
    const car = cars[index];
    const userId = interaction.user.id;
    const userTag = `<@${userId}>`;
    const channel = await client.channels.fetch(channelId);

    // 🔒 Якщо авто вже зайняте іншим користувачем
    if (!car.free && car.userId !== userId) {
      await interaction.reply({
        content: `🚫 ${car.name} вже заброньована іншим користувачем!`,
        ephemeral: true
      });
      return;
    }

    // 🔓 Якщо користувач звільняє свою фуру
    if (!car.free && car.userId === userId) {
      car.free = true;
      car.userId = null;
      car.userTag = null;
      await interaction.update(getCarList());
      await channel.send(`❎ ${userTag} звільнив **${car.name}**`);
      return;
    }

    // 🚗 Якщо користувач вже має іншу броню
    const alreadyBooked = cars.find(c => c.userId === userId);
    if (alreadyBooked && alreadyBooked !== car) {
      await interaction.reply({
        content: `🚫 Ти вже забронював **${alreadyBooked.name}**. Спочатку звільни її!`,
        ephemeral: true
      });
      return;
    }

    // ✅ Якщо вільна — бронюємо
    car.free = false;
    car.userId = userId;
    car.userTag = userTag;
    await interaction.update(getCarList());
    await channel.send(`✅ ${userTag} забронював **${car.name}**`);
  }
});

// 🕔 Автоматичне скидання броні о 05:00
cron.schedule('0 5 * * *', async () => {
  cars.forEach(c => {
    c.free = true;
    c.userId = null;
    c.userTag = null;
  });
  const channel = await client.channels.fetch(channelId);
  await channel.send('🕔 Автоматичне скидання: усі авто знову вільні!');
  console.log('🔄 Автоматичний reset виконано о 05:00');
});

client.login(token);


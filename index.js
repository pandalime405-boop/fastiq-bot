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

// 🔐 Дані з .env
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const channelId = process.env.CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});

// 🚛 Автопарк
let cars = [
  { name: 'Scania R730 #1', free: true },
  { name: 'Scania R730 #2', free: true },
  { name: 'Scania R730 #3', free: true },
  { name: 'Scania R730 #4', free: true },
  { name: 'Scania R730 #5', free: true },
  { name: 'Freightliner Century #1', free: true },
  { name: 'Freightliner Century #2', free: true },
  { name: 'Freightliner Century #3', free: true }
];

// ⚙️ Команди
const commands = [
  new SlashCommandBuilder()
    .setName('бронь')
    .setDescription('Відкрити меню бронювання авто')
].map(cmd => cmd.toJSON());

// 🧱 Реєстрація команд
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

// 📋 Функція для створення Embed + кнопок
function getCarList() {
  const embed = new EmbedBuilder()
    .setTitle('🚛 FASTIQ Logistics — Система бронювання авто')
    .setDescription('Натисни кнопку, щоб забронювати або звільнити авто.')
    .setColor('#00ADEF');

  let desc = cars
    .map(car =>
      `${car.free ? '🟢 **Вільна**' : `🔴 **Зайнята** (<@${car.userId}>)`} — ${car.name}`
    )
    .join('\n');
  embed.addFields({ name: 'Статус автопарку:', value: desc });

  // Розбивка кнопок по рядках (до 5 в ряд)
  const rows = [];
  for (let i = 0; i < cars.length; i += 5) {
    const row = new ActionRowBuilder();
    cars.slice(i, i + 5).forEach((car, index) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`car_${i + index}`)
          .setLabel(car.name.split(' ')[0]) // тільки марка
          .setStyle(car.free ? ButtonStyle.Success : ButtonStyle.Danger)
      );
    });
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

// 🟢 Коли бот запущений
client.once('ready', () => {
  console.log(`✅ Увійшов як ${client.user.tag}`);
});

// 🎯 Обробка команд і кнопок
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // 📦 /бронь
  if (interaction.isChatInputCommand() && interaction.commandName === 'бронь') {
    await interaction.reply(getCarList());
  }

  // 🚗 Кнопки бронювання
  if (interaction.isButton()) {
    const index = parseInt(interaction.customId.split('_')[1]);
    const car = cars[index];
    const userId = interaction.user.id;
    const userTag = `<@${userId}>`;
    const channel = await client.channels.fetch(channelId);

    // 🔒 Якщо користувач уже має фуру
    const existing = cars.find(c => c.userId === userId && !c.free);
    if (existing && existing !== car) {
      await interaction.reply({
        content: `🚫 Ти вже забронював **${existing.name}**. Спочатку звільни її.`,
        ephemeral: true
      });
      return;
    }

    // ✅ Якщо звільняє свою
    if (!car.free && car.userId === userId) {
      car.free = true;
      car.userId = null;
      await interaction.update(getCarList());
      await channel.send(`❎ ${userTag} звільнив **${car.name}**`);
      return;
    }

    // 🚫 Якщо чужа бронь
    if (!car.free && car.userId !== userId) {
      await interaction.reply({
        content: `🚫 **${car.name}** вже заброньована іншим користувачем!`,
        ephemeral: true
      });
      return;
    }

    // ✅ Якщо вільна — бронюємо
    car.free = false;
    car.userId = userId;
    await interaction.update(getCarList());
    await channel.send(`✅ ${userTag} забронював **${car.name}**`);
  }
});

// 🕔 Автоматичне очищення броней о 05:00 (Київ, UTC+3)
cron.schedule('0 2 * * *', async () => {
  // 05:00 за Києвом = 02:00 UTC
  cars.forEach(car => {
    car.free = true;
    car.userId = null;
  });

  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send('🕔 Автоматичне очищення: усі авто тепер вільні!');
    console.log('🔄 Автоматичне очищення виконано о 05:00 (Київ)');
  } catch (err) {
    console.error('⚠️ Не вдалося надіслати повідомлення про reset:', err);
  }
});

client.login(token);

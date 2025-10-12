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
const fs = require('fs');
const cron = require('node-cron');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const channelId = process.env.CHANNEL_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});

let carsFile = './cars.json';

// якщо немає файлу — створюємо
if (!fs.existsSync(carsFile)) {
  fs.writeFileSync(carsFile, JSON.stringify([
    { name: 'Scania R730 #1', free: true },
    { name: 'Scania R730 #2', free: true },
    { name: 'Scania R730 #3', free: true },
    { name: 'Scania R730 #4', free: true },
    { name: 'Scania R730 #5', free: true },
    { name: 'Freightliner Century #1', free: true },
    { name: 'Freightliner Century #2', free: true },
    { name: 'Freightliner Century #3', free: true }
  ], null, 2));
}

function loadCars() {
  return JSON.parse(fs.readFileSync(carsFile, 'utf8'));
}
function saveCars(cars) {
  fs.writeFileSync(carsFile, JSON.stringify(cars, null, 2));
}

const commands = [
  new SlashCommandBuilder()
    .setName('бронь')
    .setDescription('Відкрити меню бронювання авто')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Slash-команди зареєстровані!');
  } catch (error) {
    console.error('❌ Помилка при реєстрації команд:', error);
  }
})();

function getCarList(cars) {
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

  const rows = [];
  for (let i = 0; i < cars.length; i += 5) {
    const row = new ActionRowBuilder();
    cars.slice(i, i + 5).forEach((car, index) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`car_${i + index}`)
          .setLabel(car.name.split(' ')[0])
          .setStyle(car.free ? ButtonStyle.Success : ButtonStyle.Danger)
      );
    });
    rows.push(row);
  }
  return { embeds: [embed], components: rows };
}

client.once('ready', () => {
  console.log(`✅ Увійшов як ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  // /бронь
  if (interaction.isChatInputCommand() && interaction.commandName === 'бронь') {
    const cars = loadCars();
    await interaction.reply(getCarList(cars));
    return;
  }

  // Кнопки
  if (interaction.isButton()) {
    await interaction.deferUpdate();

    const cars = loadCars();
    const index = parseInt(interaction.customId.split('_')[1]);
    const car = cars[index];
    const userId = interaction.user.id;
    const userTag = `<@${userId}>`;
    const channel = await client.channels.fetch(channelId);

    const existing = cars.find(c => c.userId === userId && !c.free);
    if (existing && existing !== car) {
      await interaction.followUp({ content: `🚫 Ти вже забронював **${existing.name}**. Спочатку звільни її.`, ephemeral: true });
      return;
    }

    if (!car.free && car.userId === userId) {
      car.free = true;
      delete car.userId;
      saveCars(cars);
      await interaction.editReply(getCarList(cars));
      await channel.send(`❎ ${userTag} звільнив **${car.name}**`);
      return;
    }

    if (!car.free && car.userId !== userId) {
      await interaction.followUp({ content: `🚫 **${car.name}** вже заброньована іншим користувачем!`, ephemeral: true });
      return;
    }

    car.free = false;
    car.userId = userId;
    saveCars(cars);
    await interaction.editReply(getCarList(cars));
    await channel.send(`✅ ${userTag} забронював **${car.name}**`);
  }
});

// 🕔 Автоматичне очищення броней о 05:00 (Київ, UTC+3)
cron.schedule('0 2 * * *', async () => {
  let cars = loadCars();
  cars.forEach(car => {
    car.free = true;
    delete car.userId;
  });
  saveCars(cars);
  console.log('🔄 Автоматичне очищення виконано о 05:00 (Київ)');
});

client.login(token);


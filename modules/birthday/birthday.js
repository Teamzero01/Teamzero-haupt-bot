/**
 * Manages the birthday-embed
 * @module Birthdays
 * @author Simon Csaba <mail@scderox.de>
 */
const {getUser, getAutoSyncMembers} = require('@scnetwork/api');
const {embedType} = require('../../src/functions/helpers');
const {MessageEmbed} = require('discord.js');
const {AgeFromDateString} = require('age-calculator');
const {localize} = require('../../src/functions/localize');

/**
 * Generate the BirthdayEmbed in the configured channel
 * @param {Client} client Client
 * @param {boolean} notifyUsers If enabled the bot will notify users who have birthday today
 * @returns {Promise<void>}
 */
generateBirthdayEmbed = async function (client, notifyUsers = false) {
    const moduleConf = client.configurations['birthday']['config'];

    const channel = await client.channels.fetch(moduleConf['channelID']).catch(() => {
    });
    if (!channel) return client.logger.error(localize('birthdays', 'channel-not-found', {c: moduleConf.channelID}));
    const messages = (await channel.messages.fetch()).filter(msg => msg.author.id === client.user.id);
    await channel.guild.members.fetch({force: true});

    if (notifyUsers) {
        for (const m of messages.filter(msg => msg.id !== messages.last().id)) {
            if (m.deletable) await m.delete(); // Removing old messages
        }
    }

    const syncUsers = await client.models['birthday']['User'].findAll({
        where: {
            sync: true
        }
    });

    for (const user of syncUsers) {
        const u = await getUser(user.id).catch(() => {
        });
        if (!u) {
            client.logger.debug(localize('birthdays', 'sync-error', {u: user.id}));
            user.sync = false;
        }
        if (typeof u === 'object' && u.birthday && u.birthday.day) {
            user.day = u.birthday.day;
            user.month = u.birthday.month;
            user.year = u.birthday.year;
            user.verified = u.birthday.verified;
        }
        await user.save();
    }

    const autoSyncUsers = await getAutoSyncMembers();
    for (const au of autoSyncUsers) {
        if (!channel.guild.members.cache.get(au.id)) continue;
        if (syncUsers.find(u => u.id === au.id)) continue;
        const u = await client.models['birthday']['User'].findOne({
            where: {
                id: au.id
            }
        });
        if (u) {
            u.day = au.birthday.day;
            u.month = au.birthday.month;
            u.year = au.birthday.year;
            u.verified = au.birthday.verified;
            u.sync = true;
            await u.save();
        } else {
            await client.models['birthday']['User'].create({
                id: au.id,
                month: au.birthday.month,
                year: au.birthday.year,
                sync: true,
                day: au.birthday.day
            });
        }
    }

    const embeds = [
        new MessageEmbed()
            .setTitle(moduleConf['birthdayEmbed']['title'])
            .setDescription(moduleConf['birthdayEmbed']['description'])
            .setTimestamp()
            .setColor(moduleConf['birthdayEmbed']['color'])
            .setAuthor(client.user.username, client.user.avatarURL())
            .setFooter(client.strings.footer, client.strings.footerImgUrl)
            .addFields([
                {
                    name: localize('months', '1'),
                    value: await getUserStringForMonth(client, channel, 1),
                    inline: true
                },
                {
                    name: localize('months', '2'),
                    value: await getUserStringForMonth(client, channel, 2),
                    inline: true
                },
                {
                    name: localize('months', '3'),
                    value: await getUserStringForMonth(client, channel, 3),
                    inline: true
                },
                {
                    name: localize('months', '4'),
                    value: await getUserStringForMonth(client, channel, 4),
                    inline: true
                },
                {
                    name: localize('months', '5'),
                    value: await getUserStringForMonth(client, channel, 5),
                    inline: true
                },
                {
                    name: localize('months', '6'),
                    value: await getUserStringForMonth(client, channel, 6),
                    inline: true
                }
            ]),
        new MessageEmbed()
            .setColor(moduleConf['birthdayEmbed']['color'])
            .setFooter(client.strings.footer, client.strings.footerImgUrl)
            .addFields([{
                name: localize('months', '7'),
                value: await getUserStringForMonth(client, channel, 7),
                inline: true
            },
            {
                name: localize('months', '8'),
                value: await getUserStringForMonth(client, channel, 8),
                inline: true
            },
            {
                name: localize('months', '9'),
                value: await getUserStringForMonth(client, channel, 9),
                inline: true
            },
            {
                name: localize('months', '10'),
                value: await getUserStringForMonth(client, channel, 10),
                inline: true
            },
            {
                name: localize('months', '11'),
                value: await getUserStringForMonth(client, channel, 11),
                inline: true
            },
            {
                name: localize('months', '12'),
                value: await getUserStringForMonth(client, channel, 12),
                inline: true
            }])
    ];

    if (moduleConf['birthdayEmbed']['thumbnail']) embeds[0].setThumbnail(moduleConf['birthdayEmbed']['thumbnail']);

    if (messages.last()) await messages.last().edit({embeds});
    else channel.send({embeds});

    if (notifyUsers) {
        const birthdayUsers = await client.models['birthday']['User'].findAll({
            where: {
                month: new Date().getMonth() + 1,
                day: new Date().getDate()
            }
        });
        if (!birthdayUsers) return;

        if (moduleConf['birthday_role']) {
            const guildMembers = await channel.guild.members.fetch();
            for (const member of guildMembers.values()) {
                if (!member) return;
                if (member.roles.cache.has(moduleConf['birthday_role'])) {
                    await member.roles.remove(moduleConf['birthday_role']);
                }
            }
        }

        for (const user of birthdayUsers) {
            const member = channel.guild.members.cache.get(user.id);
            if (!member) return;
            if (user.year) {
                channel.send(embedType(moduleConf['birthday_message_with_age'], {
                    '%age%': new Date().getFullYear() - user.year,
                    '%tag%': member.user.tag,
                    '%mention%': `<@${user.id}>`
                }));
            } else {
                channel.send(embedType(moduleConf['birthday_message'], {
                    '%tag%': member.user.tag,
                    '%mention%': `<@${user.id}>`
                }));
            }
            if (moduleConf['birthday_role']) await member.roles.add(moduleConf['birthday_role']);
        }
    }
};

module.exports.generateBirthdayEmbed = generateBirthdayEmbed;

/**
 * Get UserString for a month
 * @private
 * @param {Client} client Client
 * @param {Channel} channel Channel to send embed in
 * @param {Number} month Month to render results from
 * @returns {Promise<string>}
 */
async function getUserStringForMonth(client, channel, month) {
    const monthData = await client.models['birthday']['User'].findAll({
        where: {
            month: month
        }
    });
    monthData.sort((a, b) => {
        return a.day - b.day;
    });
    let string = '';
    for (const user of monthData) {
        let dateString = `${user.day}.${month}${user.year ? `.${user.year}` : ''}`;
        if (user.year) {
            const age = new AgeFromDateString(`${user.year}-${month - 1}-${user.day}`).age;
            if (age < 13 || age > 125) {
                await user.destroy();
                continue;
            }
            dateString = `[${dateString}](https://sc-network.net/age?age=${age} "${localize('birthdays', 'age-hover', {a: age})}")`;
        }
        if (channel.guild.members.cache.get(user.id)) string = string + `${dateString}: <@${user.id}> ${user.sync ? '[🗘](https://docs.sc-network.net/de/dashboard/birthday-sync-faq "Birthday synchronized with SC Network Account")' : ''}${user.sync && user.verified ? '[✓](https://docs.sc-network.net/de/dashboard/birthday-sync-faq "Verified by SC Network Team")' : ''}\n`;
    }
    if (string.length === 0) string = localize('birthdays', 'no-bd-this-month');
    return string;
}
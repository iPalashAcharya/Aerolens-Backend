const db = require('../db');

async function getRecipients(groupId) {
    const [groups] = await db.execute(
        `SELECT id
         FROM whatsapp_group
         WHERE id = ? AND is_active = TRUE`,
        [groupId]
    );

    if (!groups.length) {
        throw new Error('Active WhatsApp group not found');
    }

    const [rows] = await db.execute(
        `SELECT m.memberId AS member_id, m.memberContact AS phone_number
         FROM whatsapp_group_member gm
         INNER JOIN member m ON m.memberId = gm.member_id
         WHERE gm.group_id = ? AND gm.is_active = TRUE`,
        [groupId]
    );

    return rows;
}

module.exports = {
    getRecipients
};

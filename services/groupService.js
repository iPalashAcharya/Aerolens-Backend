const db = require('../db');

/**
 * Active WhatsApp groups for FE dropdowns (id + display name).
 * Expects `whatsapp_group.group_name` (nullable); falls back to `Group {id}` when empty.
 */
async function listActiveWhatsappGroups() {
    const [rows] = await db.execute(
        `SELECT id AS groupId,
                COALESCE(NULLIF(TRIM(group_name), ''), CONCAT('Group ', id)) AS groupName
         FROM whatsapp_group
         WHERE is_active = TRUE
         ORDER BY groupName ASC, id ASC`
    );

    return rows;
}

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
    listActiveWhatsappGroups,
    getRecipients
};

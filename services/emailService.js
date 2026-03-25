const nodemailer = require('nodemailer');

const normalizeEnvValue = (value) => String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');

const createTransporter = () => {
    const EMAIL_USER = normalizeEnvValue(process.env.EMAIL_USER).toLowerCase();
    const EMAIL_PASS = normalizeEnvValue(process.env.EMAIL_PASS).replace(/\s+/g, '');

    if (!EMAIL_USER || !EMAIL_PASS) {
        throw new Error('EMAIL_USER and EMAIL_PASS must be set in environment variables');
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });
};

const sendInterviewEmail = async (payload) => {
    try {
        const { candidateName, role, round, location, toEmail } = payload;
        const subject = `${candidateName} - ${role} - ${round} - ${location}`;
        const transporter = createTransporter();
        const fromEmail = normalizeEnvValue(process.env.EMAIL_USER).toLowerCase();

        const info = await transporter.sendMail({
            from: fromEmail,
            to: toEmail,
            subject,
            text: 'This is an interview invitation email.'
        });

        console.log(`Interview email sent successfully. Message ID: ${info.messageId}`);
        return {
            success: true,
            messageId: info.messageId
        };
    } catch (error) {
        if (String(error.message).includes('Invalid login')) {
            console.error('Failed to send interview email: Invalid login. For Gmail, use EMAIL_USER as the Gmail address and EMAIL_PASS as a 16-character Google App Password (not your normal Gmail password).');
        } else {
            console.error('Failed to send interview email:', error.message);
        }
        throw error;
    }
};

module.exports = {
    sendInterviewEmail
};

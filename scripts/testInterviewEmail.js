require('dotenv').config();

const { sendInterviewEmail } = require('../services/emailService');

(async () => {
    try {
        const result = await sendInterviewEmail({
            candidateName: 'John Doe',
            role: 'Software Engineer',
            round: 'Technical Round 1',
            location: 'Ahmedabad',
            toEmail: 'receiver@example.com'
        });

        console.log('Email test completed:', result);
    } catch (error) {
        console.error('Email test failed:', error.message);
        process.exitCode = 1;
    }
})();

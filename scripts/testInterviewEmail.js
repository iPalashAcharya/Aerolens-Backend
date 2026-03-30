require('dotenv').config();

const { sendInterviewEmail } = require('../services/emailService');

(async () => {
    try {
        const result = await sendInterviewEmail({
            candidateName: 'John Doe',
            role: 'Software Engineer',
            round: 'Technical Round 1',
            location: 'Ahmedabad',
            dateTime: new Date(),
            toEmail: 'candidate@example.com',
            ccEmails: ['interviewer1@example.com', 'recruiter@example.com'],
            recruiter: {
                name: 'Jane Smith',
                designation: 'Senior Recruiter',
                email: 'jane@company.com',
                phone: '9876543210'
            },
            eventTimezone: 'Asia/Kolkata'
        });

        console.log('Email test completed:', result);
    } catch (error) {
        console.error('Email test failed:', error.message);
        process.exitCode = 1;
    }
})();

require('dotenv').config();
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// 🔒 HARD SAFETY
if (process.env.MODE !== 'PRODUCTION') {
    console.error('❌ REFUSING TO RUN: MODE is not PRODUCTION');
    process.exit(1);
}

console.log('🔥 PRODUCTION PASSWORD RESET SCRIPT');

async function fetchSecrets() {
    const client = new SecretsManagerClient({
        region: process.env.AWS_REGION
    });

    const res = await client.send(
        new GetSecretValueCommand({
            SecretId: process.env.SECRET_NAME
        })
    );

    const secrets = JSON.parse(res.SecretString);
    Object.assign(process.env, secrets);

    console.log('✓ PROD secrets loaded');
}

async function resetPasswords() {
    // 1️⃣ LOAD SECRETS FIRST
    await fetchSecrets();

    // 2️⃣ NOW safely import DB-dependent code
    const AuthService = require('../services/authServices');
    const MemberRepository = require('../repositories/memberRepository');

    const memberRepository = new MemberRepository();

    const tempPassword = "";
    const hashedPassword = await AuthService.hashPassword(tempPassword);

    const memberIds = [];

    for (const memberId of memberIds) {
        const member = await memberRepository.findById(memberId);
        if (!member) {
            console.warn(`Member not found: ${memberId}`);
            continue;
        }

        await memberRepository.updatePassword(memberId, hashedPassword);
        console.log(`✔ Reset password for ${member.email}`);
    }

    console.log('\n==============================');
    console.log('🔥 TEMP PROD PASSWORD (ONCE)');
    console.log(tempPassword);
    console.log('==============================');
}

resetPasswords()
    .then(() => {
        console.log('Done.');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
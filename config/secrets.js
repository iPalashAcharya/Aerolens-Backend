const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function fetchSecrets() {
    if (process.env.MODE === 'LOCAL') {
        console.log('✓ Skipping AWS Secrets Manager (LOCAL mode)');
        return;
    }

    console.log('Fetching secrets from AWS Secrets Manager...');

    const secretName = process.env.SECRET_NAME;
    const region = process.env.AWS_REGION || 'ap-south-1';
    if (!secretName) {
        console.log('✓ No SECRET_NAME provided — using local .env');
        return;
    }

    const client = new SecretsManagerClient({ region });

    const response = await client.send(
        new GetSecretValueCommand({ SecretId: secretName })
    );

    let secrets;
    if (response.SecretString) {
        secrets = JSON.parse(response.SecretString);
    } else {
        const buff = Buffer.from(response.SecretBinary, 'base64');
        secrets = JSON.parse(buff.toString('ascii'));
    }

    Object.keys(secrets).forEach(key => {
        process.env[key] = secrets[key];
    });

    console.log('✓ Secrets loaded successfully');
}

module.exports = fetchSecrets;
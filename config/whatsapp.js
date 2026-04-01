// Read at require() time — dotenv.config() is always called before this
// module is required (server.js line 1), so env vars are available.
const graphVersion = process.env.WA_GRAPH_VERSION || 'v20.0';

module.exports = {
    accessToken:   process.env.WA_ACCESS_TOKEN,
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
    wabaId:        process.env.WA_WABA_ID,
    verifyToken:   process.env.WA_VERIFY_TOKEN,
    apiBaseUrl:    `https://graph.facebook.com/${graphVersion}`,
    templateName:  process.env.WA_TEMPLATE_NAME || 'candidate_resume_v2',
    templateLanguageCode: process.env.WA_TEMPLATE_LANGUAGE_CODE || 'en'
};

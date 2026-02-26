const fetchSecrets = require("../config/secrets");

(async () => {
    await fetchSecrets();

    const db = require("../db");
    const MemberRepository = require("../repositories/memberRepository");
    const MemberService = require("../services/memberService");

    const repo = new MemberRepository();
    const service = new MemberService(repo, db);

    const client = await db.getConnection();
    console.log("Fetching members…");

    const members = await repo.findAll(client);

    for (const m of members) {
        if (!m.memberTimezone && m.locationId) {
            console.log(`Updating timezone for member ${m.memberId}...`);
            await service.updateTimezoneForMember(m, client);
        }
    }

    client.release();
    console.log("Timezone backfill complete.");
    process.exit(0);
})();
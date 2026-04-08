function normalizeRoleName(roleName) {
    return String(roleName || '').trim().toLowerCase();
}

function inferLegacyRole(member = {}) {
    const designation = normalizeRoleName(member.designation);

    if (designation === 'admin') {
        return 'Admin';
    }

    if (designation === 'hr' || designation === 'human resources') {
        return 'HR';
    }

    if (member.isRecruiter) {
        return 'Recruiter';
    }

    if (member.isInterviewer) {
        return 'Interviewer';
    }

    return 'User';
}

function isPrivilegedRole(roleName) {
    const normalized = normalizeRoleName(roleName);
    return normalized === 'hr' || normalized === 'admin';
}

function isRecruiterRole(roleName) {
    return normalizeRoleName(roleName) === 'recruiter';
}

function isInterviewerRole(roleName) {
    return normalizeRoleName(roleName) === 'interviewer';
}

module.exports = {
    normalizeRoleName,
    inferLegacyRole,
    isPrivilegedRole,
    isRecruiterRole,
    isInterviewerRole
};

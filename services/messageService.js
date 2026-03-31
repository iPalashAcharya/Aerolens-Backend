function buildDynamicText(candidate) {
    return `Name: ${candidate.name}
Experience: ${candidate.yoe} years
Current CTC: ₹${candidate.currentCtc}
Expected CTC: ₹${candidate.expectedCtc}
Notice Period: ${candidate.noticePeriod || 'N/A'}`;
}

module.exports = {
    buildDynamicText
};

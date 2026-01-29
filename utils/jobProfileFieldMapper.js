// utils/jobProfileFieldMapper.js

const fieldMappings = {
    toDatabase: {
        position: 'jobRole',
        overview: 'jobOverview',
        responsibilities: 'keyResponsibilities',
        requiredSkills: 'requiredSkillsText',
        niceToHave: 'niceToHave',
        experience: 'experienceText',
        experienceMinYears: 'experienceMinYears',
        experienceMaxYears: 'experienceMaxYears',
        techSpecifications: 'techSpecifications'
    },

    // Database field -> Frontend field
    toFrontend: {
        jobRole: 'position',
        jobOverview: 'overview',
        keyResponsibilities: 'responsibilities',
        requiredSkillsText: 'requiredSkills',
        niceToHave: 'niceToHave',
        experienceText: 'experience',
        experienceMinYears: 'experienceMinYears',
        experienceMaxYears: 'experienceMaxYears',
        jobProfileId: 'jobProfileId',
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        jdFileName: 'jdFileName',
        jdOriginalName: 'jdOriginalName',
        jdUploadDate: 'jdUploadDate'
    }
};

const transformToFrontend = (dbData) => {
    if (!dbData) return null;

    if (Array.isArray(dbData)) {
        return dbData.map(item => transformToFrontend(item));
    }

    const transformed = {};

    Object.keys(dbData).forEach(key => {
        const frontendKey = fieldMappings.toFrontend[key] || key;
        transformed[frontendKey] = dbData[key];
    });

    // Transform techSpecifications array if present
    if (dbData.techSpecifications) {
        transformed.techSpecifications = dbData.techSpecifications.map(spec => ({
            techSpecificationId: spec.lookupId,
            techSpecificationName: spec.value
        }));
    }

    return transformed;
};

const transformToDatabase = (frontendData) => {
    if (!frontendData) return null;

    const transformed = {};

    Object.keys(frontendData).forEach(key => {
        const dbKey = fieldMappings.toDatabase[key] || key;
        transformed[dbKey] = frontendData[key];
    });

    return transformed;
};

module.exports = {
    transformToFrontend,
    transformToDatabase,
    fieldMappings
};
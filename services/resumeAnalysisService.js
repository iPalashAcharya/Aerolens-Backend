const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/s3');
const AppError = require('../utils/appError');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const ANALYSIS_PROMPT_TEMPLATE = (jobDescription, resumeText) =>
`You are an expert technical recruiter. Analyze the resume against the job description below.

Job Description:
${jobDescription}

Resume:
${resumeText}

Return ONLY valid JSON (no text outside JSON):
{
  "match_percentage": <number 0-100>,
  "matched_skills": [<skills present in both>],
  "missing_skills": [<important skills missing from resume>],
  "strengths": [<strong points relevant to job>],
  "weaknesses": [<gaps or weak areas>],
  "suggestions": [<actionable improvements>],
  "summary": "<2-3 line overall evaluation>"
}
Rules: output ONLY the JSON object, nothing else. Be realistic, do not always give high scores.`;

async function downloadS3Buffer(s3Key) {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: s3Key });
    const response = await s3Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function extractTextFromS3Resume(resumeFilename) {
    if (!resumeFilename) {
        throw new AppError('No resume file found for this candidate', 400, 'NO_RESUME');
    }

    const ext = resumeFilename.split('.').pop().toLowerCase();
    if (!['pdf', 'docx'].includes(ext)) {
        throw new AppError('Only PDF and DOCX resumes can be analysed', 400, 'UNSUPPORTED_RESUME_FORMAT');
    }

    const buffer = await downloadS3Buffer(resumeFilename);

    let text;
    if (ext === 'pdf') {
        const parsed = await pdfParse(buffer);
        text = parsed.text;
    } else {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
    }

    if (!text || !text.trim()) {
        throw new AppError('Could not extract text from resume file', 422, 'EMPTY_RESUME_TEXT');
    }

    return text;
}

function buildJobDescription(jobProfile) {
    const lines = [];

    if (jobProfile.jobRole)         lines.push(`Role: ${jobProfile.jobRole}`);
    if (jobProfile.clientName)      lines.push(`Company: ${jobProfile.clientName}`);
    if (jobProfile.departmentName)  lines.push(`Department: ${jobProfile.departmentName}`);
    if (jobProfile.experienceText)  lines.push(`Experience Required: ${jobProfile.experienceText}`);
    else {
        const min = jobProfile.experienceMinYears;
        const max = jobProfile.experienceMaxYears;
        if (min != null || max != null) {
            lines.push(`Experience Required: ${min ?? 0}–${max ?? '+'} years`);
        }
    }
    if (jobProfile.workArrangement) lines.push(`Work Arrangement: ${jobProfile.workArrangement}`);
    if (jobProfile.location) {
        const loc = typeof jobProfile.location === 'string'
            ? JSON.parse(jobProfile.location)
            : jobProfile.location;
        if (loc?.city || loc?.country) lines.push(`Location: ${[loc.city, loc.country].filter(Boolean).join(', ')}`);
    }

    if (lines.length === 0) {
        throw new AppError('No job profile linked to this candidate for analysis', 400, 'NO_JOB_PROFILE');
    }

    return lines.join('\n');
}

async function analyzeWithOllama(resumeText, jobDescription) {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const model = (process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free').trim();

    if (!apiKey) {
        throw new AppError('OPENROUTER_API_KEY is not configured', 500, 'MISSING_API_KEY');
    }

    const prompt = ANALYSIS_PROMPT_TEMPLATE(jobDescription, resumeText);

    let res;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
        res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);
    } catch (err) {
        throw new AppError('OpenRouter is unreachable — check your network connection', 502, 'OPENROUTER_UNREACHABLE');
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new AppError(`OpenRouter returned HTTP ${res.status}: ${body}`, 502, 'OPENROUTER_ERROR');
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? '';

    if (!raw) {
        throw new AppError('OpenRouter returned an empty response', 502, 'EMPTY_AI_RESPONSE');
    }

    let feedback;
    try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        feedback = JSON.parse(cleaned);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                feedback = JSON.parse(match[0]);
            } catch {
                throw new AppError('OpenRouter returned invalid JSON — analysis failed', 502, 'INVALID_AI_RESPONSE');
            }
        } else {
            throw new AppError('OpenRouter returned invalid JSON — analysis failed', 502, 'INVALID_AI_RESPONSE');
        }
    }

    return feedback;
}

module.exports = { extractTextFromS3Resume, buildJobDescription, analyzeWithOllama };

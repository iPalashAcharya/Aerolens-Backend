const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/s3');
const AppError = require('../utils/appError');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

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
    const model = process.env.OLLAMA_MODEL || 'tinyllama';
    const prompt = ANALYSIS_PROMPT_TEMPLATE(jobDescription, resumeText);

    let res;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min
        res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false, options: { num_ctx: 2048 } }),
            signal: controller.signal,
        });
        clearTimeout(timeout);
    } catch (err) {
        throw new AppError(
            `Ollama is unreachable at ${OLLAMA_URL} — make sure it is running`,
            502,
            'OLLAMA_UNREACHABLE'
        );
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new AppError(
            `Ollama returned HTTP ${res.status}: ${body}`,
            502,
            'OLLAMA_ERROR'
        );
    }

    const data = await res.json();
    const raw = data.response ?? '';

    let feedback;
    try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        feedback = JSON.parse(cleaned);
    } catch {
        throw new AppError('Ollama returned invalid JSON — analysis failed', 502, 'INVALID_AI_RESPONSE');
    }

    return feedback;
}

module.exports = { extractTextFromS3Resume, buildJobDescription, analyzeWithOllama };

const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/s3');
const AppError = require('../utils/appError');

const SYSTEM_PROMPT = `You are an expert technical recruiter and resume analyst.

Your task is to analyze a candidate's resume against a given job description and provide a structured evaluation.

Instructions:
1. Carefully read both the resume and the job description.
2. Identify key skills, experience, and qualifications from both.
3. Compare the resume with the job requirements.
4. Be objective and concise.

Output format (STRICT JSON — no text outside JSON):
{
  "match_percentage": number (0-100),
  "matched_skills": [list of skills present in both resume and job description],
  "missing_skills": [list of important skills missing from the resume],
  "strengths": [list of strong points in the resume relevant to the job],
  "weaknesses": [list of gaps or weak areas],
  "suggestions": [specific actionable improvements for the candidate],
  "summary": "short 2-3 line overall evaluation"
}

Rules:
- Output ONLY valid JSON, nothing else
- Keep results realistic (do NOT always give high scores)
- Focus on skills, experience, and relevance
- If information is missing, make reasonable assumptions`;

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
    if (ext !== 'pdf') {
        throw new AppError('Only PDF resumes can be analysed', 400, 'UNSUPPORTED_RESUME_FORMAT');
    }

    const buffer = await downloadS3Buffer(resumeFilename);
    const parsed = await pdfParse(buffer);

    if (!parsed.text || !parsed.text.trim()) {
        throw new AppError('Could not extract text from resume PDF', 422, 'EMPTY_RESUME_TEXT');
    }

    return parsed.text;
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

async function analyzeWithClaude(resumeText, jobDescription) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new AppError('ANTHROPIC_API_KEY is not configured', 500, 'MISSING_API_KEY');
    }

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
            {
                role: 'user',
                content: `### Job Description:\n${jobDescription}\n\n### Resume:\n${resumeText}`
            }
        ]
    });

    const raw = message.content[0]?.text ?? '';

    let feedback;
    try {
        // Strip any accidental markdown code fences
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        feedback = JSON.parse(cleaned);
    } catch {
        throw new AppError('Claude returned invalid JSON — analysis failed', 502, 'INVALID_AI_RESPONSE');
    }

    return feedback;
}

module.exports = { extractTextFromS3Resume, buildJobDescription, analyzeWithClaude };

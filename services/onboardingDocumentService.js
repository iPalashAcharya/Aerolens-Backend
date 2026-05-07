const PDFDocument = require('pdfkit');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/s3');
const AppError = require('../utils/appError');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const S3_DOC_FOLDER =
    process.env.NODE_ENV === 'production'
        ? 'onboarding-docs/'
        : 'development/onboarding-docs/';

// ─── Doc type ────────────────────────────────────────────────────────────────

function resolveDocType(employmentTypeName) {
    const name = (employmentTypeName ?? '').toLowerCase().trim();
    if (name === 'employee') return 'offer_letter';
    if (name === 'consultant' || name === 'contractor') return 'service_agreement';
    return null;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function formatUtcDate(date) {
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function buildPrompt(docType, offer, letterDate) {
    const {
        candidateName = 'Candidate',
        jobRole = 'Position',
        clientName,
        companyName,
        offeredCTCAmount,
        currencyName,
        compensationTypeName,
        joiningDate,
        workModeName,
        reportingManagerName,
        variablePay,
        joiningBonus,
        vendorName,
    } = offer;

    const company = clientName || companyName || 'Aerolens';
    const ctcLine = [offeredCTCAmount, currencyName, compensationTypeName]
        .filter(Boolean)
        .join(' ');
    const dateFormatted = joiningDate
        ? new Date(joiningDate).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
          })
        : 'To be confirmed';

    if (docType === 'offer_letter') {
        return `You are a professional HR document writer. Generate a complete, formal Offer Letter.
Output ONLY the letter text — no JSON, no markdown fences, no preamble, no commentary.
Do NOT invent or include any dates other than the ones explicitly provided below.

Details:
- Letter Date: ${letterDate}
- Candidate: ${candidateName}
- Role: ${jobRole}
- Company: ${company}
- Reporting To: ${reportingManagerName || 'Management'}
- Work Arrangement: ${workModeName || 'As agreed'}
- Joining Date: ${dateFormatted}
- Offered CTC: ${ctcLine || 'As discussed'}${variablePay ? `\n- Variable Pay: ${variablePay} ${currencyName || ''}` : ''}${joiningBonus ? `\n- Joining Bonus: ${joiningBonus} ${currencyName || ''}` : ''}

Structure the letter with these sections (use plain text, no markdown):
1. Company letterhead block (company name, then "Date: ${letterDate}")
2. Addressee block (candidate name and greeting)
3. Offer paragraph — role, CTC, joining date
4. Terms summary — work arrangement, reporting line
5. Acceptance instructions (sign and return at your earliest convenience — do NOT mention any deadline date)
6. Closing with HR Director signature block

Tone: professional, warm, legally appropriate. Keep it under two pages.`;
    }

    return `You are a professional HR document writer. Generate a complete, formal Service Agreement for an independent consultant.
Output ONLY the agreement text — no JSON, no markdown fences, no preamble, no commentary.
Do NOT invent or include any dates other than the ones explicitly provided below.

Details:
- Agreement Date: ${letterDate}
- Consultant: ${candidateName}
- Engagement Role: ${jobRole}
- Client Company: ${company}${vendorName ? `\n- Vendor/Agency: ${vendorName}` : ''}
- Work Arrangement: ${workModeName || 'As agreed'}
- Engagement Start Date: ${dateFormatted}
- Agreed Rate: ${ctcLine || 'As discussed'}${variablePay ? `\n- Performance Bonus: ${variablePay} ${currencyName || ''}` : ''}

Structure the agreement with these numbered sections (plain text, no markdown):
1. TITLE: SERVICE AGREEMENT (then "Date: ${letterDate}")
2. Parties (Client and Consultant/Vendor)
3. Scope of Services
4. Term and Start Date
5. Compensation and Payment Terms
6. Confidentiality
7. Intellectual Property
8. Termination
9. Governing Law
10. Signature Blocks (both parties)

Tone: professional, formal, legally appropriate.`;
}

// ─── OpenRouter call ──────────────────────────────────────────────────────────

async function callOpenRouter(prompt) {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const model = (process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free').trim();

    if (!apiKey) {
        throw new AppError('OPENROUTER_API_KEY is not configured', 500, 'MISSING_API_KEY');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    let res;
    try {
        res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.4,
            }),
            signal: controller.signal,
        });
    } catch {
        throw new AppError('OpenRouter is unreachable — check network connection', 502, 'OPENROUTER_UNREACHABLE');
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new AppError(`OpenRouter returned HTTP ${res.status}: ${body}`, 502, 'OPENROUTER_ERROR');
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) {
        throw new AppError('OpenRouter returned an empty response', 502, 'EMPTY_AI_RESPONSE');
    }
    return content.trim();
}

// ─── PDF builder ──────────────────────────────────────────────────────────────

function buildPdfBuffer(documentText, title) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 72, size: 'A4' });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(1.5);
        doc.fontSize(11).font('Helvetica');

        const paragraphs = documentText.split(/\n{2,}/);
        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (!trimmed) continue;

            for (const line of trimmed.split('\n')) {
                const l = line.trim();
                if (!l) continue;
                const isHeader =
                    /^\d+\.\s+[A-Z]/.test(l) ||
                    (/^[A-Z\s:]{4,}$/.test(l) && l.length < 60);
                if (isHeader) {
                    doc.font('Helvetica-Bold').text(l);
                    doc.font('Helvetica');
                } else {
                    doc.text(l);
                }
            }
            doc.moveDown(0.8);
        }

        doc.end();
    });
}

// ─── S3 helpers ───────────────────────────────────────────────────────────────

async function uploadToS3(buffer, s3Key) {
    if (!bucketName) {
        throw new AppError('S3 bucket is not configured — document generation requires S3', 500, 'S3_NOT_CONFIGURED');
    }
    await s3Client.send(
        new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: buffer,
            ContentType: 'application/pdf',
            ServerSideEncryption: 'AES256',
        })
    );
}

async function getS3Stream(s3Key) {
    if (!bucketName) {
        throw new AppError('S3 bucket is not configured', 500, 'S3_NOT_CONFIGURED');
    }
    const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: s3Key })
    );
    return response.Body;
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function generateOnboardingDocument(offerDetails, generatedBy) {
    const docType = resolveDocType(offerDetails.employmentTypeName);
    if (!docType) {
        throw new AppError(
            `Cannot determine document type for employment type: "${offerDetails.employmentTypeName}"`,
            400,
            'UNKNOWN_EMPLOYMENT_TYPE'
        );
    }

    const generatedAt = new Date();
    const formattedDate = formatUtcDate(generatedAt);

    const title = docType === 'offer_letter' ? 'OFFER LETTER' : 'SERVICE AGREEMENT';
    const prompt = buildPrompt(docType, offerDetails, formattedDate);
    const rawText = await callOpenRouter(prompt);
    const documentText = rawText
        // "Date: <anything>" lines — enforce correct date in case AI drifts
        .replace(/^[ \t]*Date:[ \t]*.*/gim, `Date: ${formattedDate}`)
        // bare date lines with no prefix (e.g. "6 May 2025" on its own line)
        .replace(/^[ \t]*\d{1,2}\s+[A-Za-z]+\s+\d{4}[ \t]*$/gm, `Date: ${formattedDate}`)
        // strip hallucinated "by <date>" / "on or before <date>" deadline phrases
        .replace(/\s+(on or before|by)\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/gi, '');
    const pdfBuffer = await buildPdfBuffer(documentText, title);

    const timestamp = generatedAt.getTime();
    const safeName = (offerDetails.candidateName || 'candidate')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
    const docFileName = `${docType}_${safeName}_${timestamp}.pdf`;
    const s3Key = `${S3_DOC_FOLDER}offer_${offerDetails.offerId}_${timestamp}.pdf`;

    await uploadToS3(pdfBuffer, s3Key);

    return {
        docType,
        docFileName,
        docS3Key: s3Key,
        docMimeType: 'application/pdf',
        docFileSize: pdfBuffer.length,
        generatedBy,
    };
}

module.exports = { generateOnboardingDocument, resolveDocType, getS3Stream };

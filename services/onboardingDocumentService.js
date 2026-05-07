'use strict';

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, bucketName } = require('../config/s3');
const AppError = require('../utils/appError');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const S3_DOC_FOLDER =
    process.env.NODE_ENV === 'production'
        ? 'onboarding-docs/'
        : 'development/onboarding-docs/';

// ── Doc type ──────────────────────────────────────────────────────────────────

function resolveDocType(employmentTypeName) {
    const name = (employmentTypeName ?? '').toLowerCase().trim();
    if (name === 'employee') return 'offer_letter';
    if (name === 'consultant' || name === 'contractor') return 'service_agreement';
    return null;
}

// ── Page layout constants (A4 points) ────────────────────────────────────────

const PAGE_W     = 595.28;
const ML         = 50;                   // left margin
const MR         = 50;                   // right margin
const CW         = PAGE_W - ML - MR;    // 495.28 pt content width
const HDR_Y      = 35;                   // header block top
const HDR_LINE_Y = 108;                  // rule under header
const BODY_Y     = 117;                  // body content starts
const FTR_LINE_Y = 785;                  // footer rule y
const FTR_Y      = 791;                  // footer text top

// ── Colour palette ────────────────────────────────────────────────────────────

const BLACK    = '#000000';
const DGRAY    = '#444444';
const LGRAY    = '#888888';
const RULE_CLR = '#BBBBBB';
const TBL_HDR  = '#FFC000';   // amber — matches original template header row
const TBL_BOLD = '#E0E0E0';   // light grey for sub-header rows
const TBL_BORD = '#AAAAAA';

// ── Assets ────────────────────────────────────────────────────────────────────

const ASSETS_DIR = path.join(__dirname, '../assets');

function getAsset(name) {
    const p = path.join(ASSETS_DIR, name);
    return fs.existsSync(p) ? p : null;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function fmtDate(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
}

// ── Currency helpers ──────────────────────────────────────────────────────────

function getCurrencyPrefix(currencyName) {
    const c = (currencyName || 'INR').trim().toUpperCase();
    if (c === 'USD') return '$ ';
    if (c === 'GBP') return '\xa3 ';   // £ — in Latin-1, safe with Times-Roman
    if (c === 'EUR') return 'EUR ';    // € is not reliably in built-in PDF fonts
    return 'Rs. ';                      // INR and all others
}

function fmtAmount(n, currencyName) {
    if (n === null || n === undefined || isNaN(Number(n))) return '--';
    const rounded  = Math.round(Number(n));
    const abs      = Math.abs(rounded);
    const prefix   = getCurrencyPrefix(currencyName);
    const sign     = rounded < 0 ? '-' : '';
    const c        = (currencyName || 'INR').trim().toUpperCase();

    if (c === 'INR') {
        // Indian grouping: last 3 digits, then groups of 2
        const s = String(abs);
        let formatted;
        if (s.length <= 3) {
            formatted = s;
        } else {
            let rest = s.slice(0, -3);
            let tail = s.slice(-3);
            while (rest.length > 2) {
                tail = rest.slice(-2) + ',' + tail;
                rest = rest.slice(0, -2);
            }
            formatted = rest + ',' + tail;
        }
        return prefix + sign + formatted;
    }
    // Western grouping for all other currencies
    return prefix + sign + abs.toLocaleString('en-US');
}

// ── Salary calculator ─────────────────────────────────────────────────────────
// For INR + LPA (annual): amount treated as lakhs per annum.
// For Hourly: amount × 160 hrs/month.
// For Monthly: amount is already monthly.
// Indian statutory components (PF, ESIC, PT, Gratuity) only applied for INR.

function calcSalary(amount, currencyName, compensationTypeName) {
    if (!amount || Number(amount) <= 0) return null;

    const amt      = Number(amount);
    const currency = (currencyName || 'INR').trim().toUpperCase();
    const compType = (compensationTypeName || '').trim().toLowerCase();
    const isINR    = currency === 'INR' || currency === '';

    let monthly;
    if (compType.includes('hour')) {
        monthly = amt * 160;
    } else if (compType.includes('month')) {
        monthly = amt;
    } else {
        // Annual / LPA (default)
        monthly = isINR ? (amt * 100000) / 12 : (amt * 1000) / 12;
    }

    const basic = Math.round(monthly * 0.40);
    const hra   = Math.round(basic   * 0.50);
    const conv  = Math.round(basic   * 0.10);
    const gross = basic + hra + conv;

    // Indian statutory components — only for INR
    const epf_er   = isINR ? Math.min(Math.round(basic * 0.12), 1800) : 0;
    const esic_er  = (isINR && gross <= 21000) ? Math.round(gross * 0.0325) : 0;
    const sbonus   = (isINR && gross <= 21000) ? Math.round(Math.min(basic, 7000) * 0.0833) : 0;
    const gratuity = isINR ? Math.round(basic * 0.0481) : 0;
    const emp_b    = epf_er + esic_er + sbonus + gratuity;
    const tot_comp = gross + emp_b;

    const epf_ee  = epf_er;
    const esic_ee = (isINR && gross <= 21000) ? Math.round(gross * 0.0075) : 0;
    const pt      = isINR ? 200 : 0;
    const tot_ded = epf_ee + esic_ee + pt;
    const net     = gross - tot_ded;

    const row = (m) => ({ m, y: m * 12 });
    return {
        isINR,
        basic:    row(basic),
        hra:      row(hra),
        conv:     row(conv),
        gross:    row(gross),
        epf_er:   row(epf_er),
        esic_er:  row(esic_er),
        sbonus:   row(sbonus),
        gratuity: row(gratuity),
        emp_b:    row(emp_b),
        tot_comp: row(tot_comp),
        epf_ee:   row(epf_ee),
        esic_ee:  row(esic_ee),
        pt:       row(pt),
        tot_ded:  row(tot_ded),
        net:      row(net),
    };
}

// ── Offer letter PDF builder ──────────────────────────────────────────────────

function buildOfferLetterPdf(offer) {
    return new Promise((resolve, reject) => {
        const doc    = new PDFDocument({ autoFirstPage: false, size: 'A4', margin: 0 });
        const chunks = [];
        doc.on('data',  (c) => chunks.push(c));
        doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const logoPath = getAsset('logo.png');
        const sigPath  = getAsset('signature.png');

        const letterDate   = fmtDate(new Date());
        const startDate    = fmtDate(offer.joiningDate)    || '___________';
        const signBefore   = offer.signBeforeDate
            ? fmtDate(offer.signBeforeDate)
            : '___________';
        const rmLine       = [offer.reportingManagerName, offer.reportingManagerDesignation]
            .filter(Boolean).join(' – ');  // en-dash (in WinANSI)
        const currencyName = (offer.currencyName || 'INR').trim();
        const compType     = (offer.compensationTypeName || 'LPA').trim();
        const ctcDisplay   = offer.offeredCTCAmount != null
            ? `${offer.offeredCTCAmount} ${currencyName} ${compType}`
            : 'As discussed';
        const salary       = calcSalary(offer.offeredCTCAmount, currencyName, compType);
        const fmt          = (n) => fmtAmount(n, currencyName);

        // ── Drawing primitives ────────────────────────────────────────────────

        function hRule(y, color) {
            doc.moveTo(ML, y).lineTo(PAGE_W - MR, y)
               .strokeColor(color || RULE_CLR).lineWidth(0.6).stroke();
        }

        function drawHeader() {
            if (logoPath) {
                doc.image(logoPath, ML, HDR_Y, { width: 110 });
            } else {
                doc.fontSize(20).font('Times-Bold').fillColor('#1a1a6e')
                   .text('aerolens', ML, HDR_Y + 6);
            }
            doc.fontSize(7.5).font('Times-Roman').fillColor(LGRAY)
               .text('Aerolens India Private Limited',
                     ML, HDR_Y + 2,  { width: CW, align: 'right' })
               .text('Brain Wire Block C, 11th Floor, Navratna Business Park, Near Sindhu Bhavan Road, Opp. GTPL House, Bodakdev, Ahmedabad - 380059',
                     ML, HDR_Y + 13, { width: CW, align: 'right' })
               .text('www.aerolens.net  hr@aerolens.net',
                     ML, HDR_Y + 24, { width: CW, align: 'right' });
            hRule(HDR_LINE_Y);
        }

        function drawFooter() {
            hRule(FTR_LINE_Y);
            doc.fontSize(9).font('Times-Bold').fillColor(BLACK)
               .text('Aerolens India Private Limited',
                     ML, FTR_Y + 2, { width: CW, align: 'center' });
            doc.fontSize(7.5).font('Times-Roman').fillColor(DGRAY)
               .text('Brain Wire Block C, 11th Floor, Navratna Business Park, Near Sindhu Bhavan Road, Opp. GTPL House, Bodakdev, Ahmedabad - 380059',
                     ML, FTR_Y + 14, { width: CW, align: 'center' })
               .text('www.aerolens.net   hr@aerolens.net',
                     ML, FTR_Y + 26, { width: CW, align: 'center' });
        }

        function newPage() {
            doc.addPage({ size: 'A4', margin: 0 });
            drawHeader();
            drawFooter();
            doc.x = ML;
            doc.y = BODY_Y;
        }

        // Write a paragraph from the current doc.y; updates doc.y on exit.
        function para(text, opts = {}) {
            doc.fontSize(opts.size || 10)
               .font(opts.bold ? 'Times-Bold' : 'Times-Roman')
               .fillColor(BLACK)
               .text(text, ML, doc.y, {
                   width: CW,
                   align: opts.align || 'justify',
                   lineGap: 0,
               });
            doc.moveDown(opts.gap !== undefined ? opts.gap : 0.45);
        }

        // Bullet point using a drawn circle (avoids Unicode glyph issues).
        function bullet(text) {
            const y0     = doc.y;
            const indent = 18;
            doc.circle(ML + indent - 11, y0 + 5.5, 2.2).fill(BLACK);
            doc.fillColor(BLACK).fontSize(10).font('Times-Roman')
               .text(text, ML + indent, y0, { width: CW - indent, align: 'justify', lineGap: 0 });
            doc.moveDown(0.4);
        }

        // Inline "Bold label: " + normal body text on the same paragraph.
        function labelPara(boldLabel, normalText) {
            doc.fontSize(10).font('Times-Bold').fillColor(BLACK)
               .text(boldLabel, ML, doc.y, { width: CW, continued: true, lineGap: 0 });
            doc.font('Times-Roman')
               .text(normalText, { align: 'justify', lineGap: 0 });
            doc.moveDown(0.45);
        }

        // ── Salary table ──────────────────────────────────────────────────────

        function drawSalaryTable(startY) {
            const c0   = 272;
            const c1   = 111;
            const c2   = CW - c0 - c1;   // ~112
            const rowH = 16;
            let   y    = startY;

            function tCell(text, x, cy, w, opts = {}) {
                if (opts.bg) {
                    doc.rect(x, cy, w, rowH).fill(opts.bg);
                }
                doc.rect(x, cy, w, rowH)
                   .strokeColor(TBL_BORD).lineWidth(0.3).stroke();
                doc.fontSize(opts.size || 8.5)
                   .font(opts.bold ? 'Times-Bold' : 'Times-Roman')
                   .fillColor(BLACK)
                   .text(text, x + 4, cy + 4, { width: w - 8, lineBreak: false });
            }

            function tRow(label, monthly, yearly, opts = {}) {
                const bg = opts.hdr ? TBL_HDR : opts.bold ? TBL_BOLD : null;
                tCell(label,          ML,           y, c0, { bg, bold: opts.bold || opts.hdr, size: opts.hdr ? 9 : 8.5 });
                tCell(monthly || '',  ML + c0,      y, c1, { bg, bold: opts.bold || opts.hdr });
                tCell(yearly  || '',  ML + c0 + c1, y, c2, { bg, bold: opts.bold || opts.hdr });
                y += rowH;
            }

            const s = salary;
            tRow('Particulars', 'Monthly', 'Yearly', { hdr: true });

            if (s) {
                tRow('Basic Wage',             fmt(s.basic.m),    fmt(s.basic.y));
                tRow('HRA',                    fmt(s.hra.m),      fmt(s.hra.y));
                tRow('Conveyance Allowance',   fmt(s.conv.m),     fmt(s.conv.y));
                tRow('Gross Salary (A)',        fmt(s.gross.m),    fmt(s.gross.y),    { bold: true });
                tRow('Employer Contributions (B)', '', '',            { bold: true });
                tRow("Employers' Contribution - Provident Fund", fmt(s.epf_er.m),   fmt(s.epf_er.y));
                tRow("Employers' Contribution - ESIC",
                     s.esic_er.m ? fmt(s.esic_er.m) : 'N/A',
                     s.esic_er.y ? fmt(s.esic_er.y) : 'N/A');
                tRow('Statutory Bonus',
                     s.sbonus.m ? fmt(s.sbonus.m) : 'N/A',
                     s.sbonus.y ? fmt(s.sbonus.y) : 'N/A');
                tRow('Gratuity*',              fmt(s.gratuity.m), fmt(s.gratuity.y));
                tRow('Total Compensation & Benefits (A+B)', fmt(s.tot_comp.m), fmt(s.tot_comp.y), { bold: true });
                tRow('Deductions', '', '',     { bold: true });
                tRow('Employee Contribution - Provident Fund', fmt(s.epf_ee.m), fmt(s.epf_ee.y));
                tRow('Employee Contribution - ESIC',
                     s.esic_ee.m ? fmt(s.esic_ee.m) : 'N/A',
                     s.esic_ee.y ? fmt(s.esic_ee.y) : 'N/A');
                tRow('Professional Tax',       fmt(s.pt.m),       fmt(s.pt.y));
                tRow('Total Deductions',       fmt(s.tot_ded.m),  fmt(s.tot_ded.y),  { bold: true });
                tRow('Net Pay',                fmt(s.net.m),      fmt(s.net.y),       { bold: true });
            } else {
                ['Basic Wage', 'HRA', 'Conveyance Allowance'].forEach((l) => tRow(l, '', ''));
                tRow('Gross Salary (A)', '', '', { bold: true });
                tRow('Employer Contributions (B)', '', '', { bold: true });
                ["Employers' Contribution - Provident Fund",
                 "Employers' Contribution - ESIC",
                 'Statutory Bonus', 'Gratuity*'].forEach((l) => tRow(l, '', ''));
                tRow('Total Compensation & Benefits (A+B)', '', '', { bold: true });
                tRow('Deductions', '', '', { bold: true });
                ['Employee Contribution - Provident Fund',
                 'Employee Contribution - ESIC',
                 'Professional Tax'].forEach((l) => tRow(l, '', ''));
                tRow('Total Deductions', '', '', { bold: true });
                tRow('Net Pay',          '', '', { bold: true });
            }

            return y;
        }

        // ════════════════════════════════════════════════════════════════════
        // PAGE 1
        // ════════════════════════════════════════════════════════════════════
        newPage();

        // Date
        doc.fontSize(10).font('Times-Bold').fillColor(BLACK)
           .text(`Date: ${letterDate}`, ML, doc.y);
        doc.moveDown(0.8);

        // Centred underlined heading
        doc.fontSize(10).font('Times-Bold').fillColor(BLACK)
           .text('Offer Letter', ML, doc.y, { width: CW, align: 'center', underline: true });
        doc.moveDown(0.9);

        // Greeting
        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text(`Dear ${offer.candidateName || '___________'},`, ML, doc.y);
        doc.moveDown(0.55);

        // Opening paragraph
        para(
            'On behalf of Aerolens India Pvt Ltd (hereinafter referred to as the "Company"), We are pleased ' +
            `to offer you the position of ${offer.jobRole || '___________'}. This letter sets forth the terms ` +
            'of our offer, which, if you accept, will govern your employment with the Company. Please note your ' +
            'employment with us is conditional and contingent upon your acceptance of this offer, as well as ' +
            'other terms set forth herein and/or Company policies as amended from time to time.'
        );

        // Employment start paragraph — inline bold placeholders
        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text('Your employment will begin on ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Bold').text(startDate, { continued: true });
        doc.font('Times-Roman').text(' and your work location will be ', { continued: true });
        doc.font('Times-Bold').text(offer.workModeName || '___________', { continued: true });
        doc.font('Times-Roman').text('. You will be reporting to ', { continued: true });
        doc.font('Times-Bold').text(rmLine || '___________', { continued: true });
        doc.font('Times-Roman')
           .text(' and our office located at Brain Wire Block C, 11th Floor, Navratna Business Park, Near Sindhu Bhavan Road, Opp. GTPL House, Bodakdev, Ahmedabad - 380059',
                 { align: 'justify', lineGap: 0 });
        doc.moveDown(0.45);

        // Working Schedule
        labelPara('Working Schedule: ',
            'This role involves ongoing responsibilities aligned with business needs and is not eligible for ' +
            'overtime compensation. The standard working hours are 02:00 PM to 11:00 PM, which may vary based ' +
            'on project, client, or location requirements. Employees may be required to work on weekends, when ' +
            'necessary, for which a compensatory day off will be provided in accordance with company policy. ' +
            'Employees are expected to meet agreed timelines in coordination with their manager. The organization ' +
            'is committed to fostering a performance-driven culture while supporting a healthy work-life balance.');

        // Probation
        doc.fontSize(10).font('Times-Bold').fillColor(BLACK)
           .text('Probation: ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Roman').text('Your ', { continued: true });
        doc.font('Times-Bold').text('90 days', { continued: true });
        doc.font('Times-Roman')
           .text(
               ' of service following your training will be considered probationary and you will be appraised ' +
               'for satisfactory performance. If your performance is found unsatisfactory, Aerolens India Pvt Ltd ' +
               'may extend the probation period or terminate your employment with immediate effect. During the ' +
               'extension of the probation period, if your performance is still found unsatisfactory, Aerolens ' +
               'India Pvt Ltd shall be entitled to terminate your services forthwith without any notice whatsoever. ' +
               'If not communicated otherwise, after completion of the stipulated probation period, you will ' +
               'automatically be converted into a confirmed employee.',
               { align: 'justify', lineGap: 0 });
        doc.moveDown(0.45);

        // Separation
        doc.fontSize(10).font('Times-Bold').fillColor(BLACK)
           .text('Separation: ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Roman').text('A minimum of ', { continued: true });
        doc.font('Times-Bold').text('3 (three) months\' notice period', { continued: true });
        doc.font('Times-Roman')
           .text(
               ' or salary in lieu of notice period is required for termination of employment terms by either ' +
               'side seeking the termination. However, it will be the discretion of management to accept the ' +
               'salary in lieu of the notice period or ask an employee to serve the notice period. Salary for ' +
               'the purpose of the notice period means total cost to the company (CTC). In case of incomplete ' +
               'assignment, the company has the discretion to relieve you only at the end of 3 months\' notice period.',
               { align: 'justify', lineGap: 0 });
        doc.moveDown(0.45);

        bullet('During the probation period, employees are required to give a minimum of 4 (Four) weeks\' notice period before separation.');
        bullet('Our compensation and benefit package or any discussion of the same is not a commitment that your employment will have a minimum or a fixed term or that it is terminable only for a cause. No promises can be expressed or implied by anyone, that your employment is for any minimum or fixed term or that cause is required for the termination of the employment relationship. By signing below, you acknowledge that your employment at the Company is for an unspecified duration, and neither this letter, nor your acceptance thereof, constitutes a contract for employment.');
        bullet('Upon separation from the Company for any reason, you agree to return to the Company any equipment that has been provided to you. The Company reserves the right to deduct such costs from any final payments to be made to you.');
        bullet('In the event of your leaving our company, for any reason, you shall return all the Company\'s documents, papers, disks, etc. to the authorized person of the Company. All manuals, literature, new systems, programmers, products etc. developed by you, while in Company service will always be deemed to be the sole property of the Company.');

        // ════════════════════════════════════════════════════════════════════
        // PAGE 2
        // ════════════════════════════════════════════════════════════════════
        newPage();

        // No Inconsistent Obligations
        labelPara('No Inconsistent Obligations: ',
            'You represent that you are aware of no obligations legal or otherwise, inconsistent with the terms ' +
            'of this Agreement or with you undertaking employment with the Company.');

        doc.moveDown(0.2);

        // Compensation heading
        para('Compensation and Benefits:', { bold: true, align: 'left', gap: 0.3 });

        // CTC line
        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text('•  Total CTC ', ML + 14, doc.y, { continued: true, width: CW - 14, lineGap: 0 });
        doc.font('Times-Bold').text(ctcDisplay, { continued: true });
        doc.font('Times-Roman')
           .text('. As discussed and agreed upon mutually during your interview process. Salary break-up is as below.',
                 { align: 'justify', lineGap: 0 });
        doc.moveDown(0.5);

        // Salary table
        const tableEndY = drawSalaryTable(doc.y);
        doc.y = tableEndY + 5;

        doc.fontSize(8).font('Times-Roman').fillColor(DGRAY)
           .text('* Subject to applicability.', ML, doc.y);
        doc.moveDown(0.6);

        // Obligatory Deductions
        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text('•  ', ML + 14, doc.y, { continued: true, width: CW - 14, lineGap: 0 });
        doc.font('Times-Bold').text('Obligatory Deductions. ', { continued: true });
        doc.font('Times-Roman')
           .text(
               'Aerolens shall make necessary statutory deductions (PF, TDS, PT, etc.) from your salary and ' +
               'directly pay on your behalf to the concerned authorities. The Company shall make any deductions ' +
               'from the salary, as communicated from time to time. For example, deductions towards company ' +
               'provided transport, accommodation, non-adherence as per disciplinary policies, etc. ' +
               'Gratuity shall be payable when due as per the \'Payment of Gratuity Act 1972\'. ' +
               'Bonus / Statutory Bonus, if applicable as per The Payment of Bonus Act, 1965, shall be paid ' +
               'in 12 equal monthly instalments in advance.',
               { align: 'justify', lineGap: 0 });
        doc.moveDown(0.45);

        // Benefits
        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text('•  ', ML + 14, doc.y, { continued: true, width: CW - 14, lineGap: 0 });
        doc.font('Times-Bold').text('Benefits. ', { continued: true });
        doc.font('Times-Roman')
           .text(
               'As an employee, in addition to your compensation package, you will also be eligible to receive ' +
               'the benefits which are offered to all Company employees, as described below:',
               { align: 'justify', lineGap: 0 });
        doc.moveDown(0.45);

        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text('A.  You are eligible for paid leaves as follows which will begin to earn immediately after ' +
               'joining and accrue monthly (total leave equally divided in 12 months)',
               ML + 22, doc.y, { width: CW - 22, align: 'justify', lineGap: 0 });
        doc.moveDown(0.5);

        para('Additional Leaves', { bold: true, align: 'center', gap: 0.3 });

        // Leave table
        const leaveRows = [
            ['Bereavement Leave',   '01 Days'],
            ['PTO',                 '12 Days (1 per month)'],
            ['Casual Leave',        '06 Days (0.5 per month)'],
            ['Sick Leave',          '06 Days'],
            ['Company Paid Holiday','As per official list'],
        ];
        const lc0 = 220;
        const lc1 = CW - lc0;
        let lY = doc.y;
        leaveRows.forEach(([label, val]) => {
            doc.rect(ML,       lY, lc0, 16).strokeColor(TBL_BORD).lineWidth(0.3).stroke();
            doc.rect(ML + lc0, lY, lc1, 16).strokeColor(TBL_BORD).lineWidth(0.3).stroke();
            doc.fontSize(9).font('Times-Roman').fillColor(BLACK)
               .text(label, ML + 4,       lY + 4, { width: lc0 - 8, lineBreak: false })
               .text(val,   ML + lc0 + 4, lY + 4, { width: lc1 - 8, lineBreak: false });
            lY += 16;
        });
        doc.y = lY + 8;

        // ════════════════════════════════════════════════════════════════════
        // PAGE 3
        // ════════════════════════════════════════════════════════════════════
        newPage();

        para('Acceptance:', { bold: true, align: 'left', gap: 0.35 });

        bullet('The Appointment is given subject to your information supplied in the Application Form and resume to be absolutely true. In the event, any information supplied by you is found wrong or otherwise you shall be liable for termination without any notice and in such an event the management of Aerolens India Pvt Ltd will have sole discretion to withhold / recover salaries payable/paid.');
        bullet('The employee hereby agrees that he/she will sign as and when required agreement/s with Employer/Clients with regards to data security and confidentiality.');

        // Sign-before bullet with inline bold date
        {
            const y0 = doc.y;
            doc.circle(ML + 7, y0 + 5.5, 2.2).fill(BLACK);
            doc.fillColor(BLACK).fontSize(10).font('Times-Roman')
               .text(
                   'The Offer letter is issued / enclosed in duplicate, please sign the duplicate copy in ' +
                   'acknowledgment of your acceptance of the above stated terms and conditions and return to us by ',
                   ML + 18, y0, { continued: true, width: CW - 18, lineGap: 0 });
            doc.font('Times-Bold').text(signBefore, { continued: true });
            doc.font('Times-Roman')
               .text(' after which the offer stands automatically withdrawn.',
                     { align: 'justify', lineGap: 0 });
            doc.moveDown(0.55);
        }

        para(
            'The appointment is subject to submission and positive verification of the following documents and ' +
            'background verification check conducted by Aerolens India Pvt Ltd approved agency.'
        );

        [
            'Signed Offer Letter.',
            'Latest passport sized photograph-2 Nos.',
            'Soft copies of highest educational degree held & other professional qualification(s) certificates, if any.',
            'Soft copy of Residence Proof (Passport / Aadhar Card / Voter ID Card).',
            'Soft copy of Identity Proof (PAN card/ Passport / Driving License / Voter ID).',
            'Relieving & Experience letter of previous 2 employments.',
        ].forEach(bullet);

        doc.moveDown(0.2);

        // Reporting Date
        doc.fontSize(10).font('Times-Bold').fillColor(BLACK)
           .text('Reporting Date: ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Roman')
           .text('This appointment will take effect from the date of joining duty, which shall not be later than ',
                 { continued: true });
        doc.font('Times-Bold').text(startDate, { continued: true });
        doc.font('Times-Roman')
           .text('. It is the company\'s discretion to change the joining date based on mutual agreement between company and candidate.',
                 { align: 'justify', lineGap: 0 });
        doc.moveDown(0.55);

        para('Should you have any questions about joining the Company, please do not hesitate to contact the undersigned.');

        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text('We are excited about the opportunity to work with you at ', ML, doc.y, { continued: true, lineGap: 0 });
        doc.font('Times-Bold').text('Aerolens India Pvt Ltd');
        doc.moveDown(0.7);

        para('Sincerely,', { align: 'left', gap: 0.2 });

        if (sigPath) {
            doc.image(sigPath, ML, doc.y, { width: 170 });
            doc.moveDown(0.5);
        } else {
            doc.moveDown(3);
        }

        para('Bhavin Trivedi', { bold: true, align: 'left', gap: 0.1 });
        para('Aerolens India Pvt Ltd', { bold: true, align: 'left' });

        // ════════════════════════════════════════════════════════════════════
        // PAGE 4
        // ════════════════════════════════════════════════════════════════════
        newPage();

        para('Acknowledgement:', { bold: true, align: 'left', gap: 0.5 });

        doc.fontSize(10).font('Times-Roman').fillColor(BLACK)
           .text(
               'I have read and accepted the terms and conditions outlined above. I agree to keep the terms of ' +
               'this letter confidential. As desired, I shall join services w.e.f. ',
               ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Bold').text(startDate);
        doc.moveDown(1.8);

        para('Name:', { bold: true, align: 'left', gap: 1.4 });

        // Signature / Date line
        doc.fontSize(10).font('Times-Bold').fillColor(BLACK)
           .text('Signature: ', ML, doc.y, { continued: true, lineGap: 0 });
        doc.font('Times-Roman').text('__________________________', { continued: true });
        doc.font('Times-Bold').text('   Date: ', { continued: true });
        doc.font('Times-Roman').text('_____________');

        doc.end();
    });
}

// ── OpenRouter (Service Agreement only) ──────────────────────────────────────

function formatUtcDate(date) {
    return date.toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
}

function buildServiceAgreementPrompt(offer, letterDate) {
    const {
        candidateName = 'Candidate',
        jobRole       = 'Position',
        clientName,
        companyName,
        offeredCTCAmount,
        currencyName,
        compensationTypeName,
        joiningDate,
        workModeName,
        variablePay,
        vendorName,
    } = offer;

    const company  = clientName || companyName || 'Aerolens';
    const ctcLine  = [offeredCTCAmount, currencyName, compensationTypeName].filter(Boolean).join(' ');
    const dateStr  = joiningDate
        ? new Date(joiningDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        : 'To be confirmed';

    return `You are a professional HR document writer. Generate a complete, formal Service Agreement for an independent consultant.
Output ONLY the agreement text — no JSON, no markdown fences, no preamble, no commentary.
Do NOT invent or include any dates other than the ones explicitly provided below.

Details:
- Agreement Date: ${letterDate}
- Consultant: ${candidateName}
- Engagement Role: ${jobRole}
- Client Company: ${company}${vendorName ? `\n- Vendor/Agency: ${vendorName}` : ''}
- Work Arrangement: ${workModeName || 'As agreed'}
- Engagement Start Date: ${dateStr}
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

async function callOpenRouter(prompt) {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    const model  = (process.env.OPENROUTER_MODEL  || 'meta-llama/llama-3.2-3b-instruct:free').trim();

    if (!apiKey) {
        throw new AppError('OPENROUTER_API_KEY is not configured', 500, 'MISSING_API_KEY');
    }

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    let res;
    try {
        res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.4 }),
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

    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new AppError('OpenRouter returned an empty response', 502, 'EMPTY_AI_RESPONSE');
    return content.trim();
}

function buildServiceAgreementPdfBuffer(text) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 72, size: 'A4' });
        const chunks = [];
        doc.on('data',  (c) => chunks.push(c));
        doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(16).font('Helvetica-Bold').text('SERVICE AGREEMENT', { align: 'center' });
        doc.moveDown(1.5);
        doc.fontSize(11).font('Helvetica');

        for (const para of text.split(/\n{2,}/)) {
            const trimmed = para.trim();
            if (!trimmed) continue;
            for (const line of trimmed.split('\n')) {
                const l = line.trim();
                if (!l) continue;
                const isHeader = /^\d+\.\s+[A-Z]/.test(l) || (/^[A-Z\s:]{4,}$/.test(l) && l.length < 60);
                if (isHeader) { doc.font('Helvetica-Bold').text(l); doc.font('Helvetica'); }
                else { doc.text(l); }
            }
            doc.moveDown(0.8);
        }

        doc.end();
    });
}

// ── S3 helpers ────────────────────────────────────────────────────────────────

async function uploadToS3(buffer, s3Key) {
    if (!bucketName) {
        throw new AppError('S3 bucket is not configured — document generation requires S3', 500, 'S3_NOT_CONFIGURED');
    }
    await s3Client.send(new PutObjectCommand({
        Bucket: bucketName, Key: s3Key, Body: buffer,
        ContentType: 'application/pdf', ServerSideEncryption: 'AES256',
    }));
}

async function getS3Stream(s3Key) {
    if (!bucketName) throw new AppError('S3 bucket is not configured', 500, 'S3_NOT_CONFIGURED');
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));
    return response.Body;
}

// ── Main export ───────────────────────────────────────────────────────────────

async function generateOnboardingDocument(offerDetails, generatedBy) {
    const docType = resolveDocType(offerDetails.employmentTypeName);
    if (!docType) {
        throw new AppError(
            `Cannot determine document type for employment type: "${offerDetails.employmentTypeName}"`,
            400, 'UNKNOWN_EMPLOYMENT_TYPE'
        );
    }

    const generatedAt  = new Date();
    const timestamp    = generatedAt.getTime();
    const safeName     = (offerDetails.candidateName || 'candidate')
                             .toLowerCase().replace(/[^a-z0-9]/g, '_');
    const docFileName  = `${docType}_${safeName}_${timestamp}.pdf`;
    const s3Key        = `${S3_DOC_FOLDER}offer_${offerDetails.offerId}_${timestamp}.pdf`;

    let pdfBuffer;

    if (docType === 'offer_letter') {
        pdfBuffer = await buildOfferLetterPdf(offerDetails);
    } else {
        const letterDate = formatUtcDate(generatedAt);
        const prompt     = buildServiceAgreementPrompt(offerDetails, letterDate);
        let   rawText    = await callOpenRouter(prompt);

        rawText = rawText
            .replace(/^[ \t]*Date:[ \t]*.*/gim,            `Date: ${letterDate}`)
            .replace(/^[ \t]*\d{1,2}\s+[A-Za-z]+\s+\d{4}[ \t]*$/gm, `Date: ${letterDate}`)
            .replace(/\s+(on or before|by)\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/gi, '');

        pdfBuffer = await buildServiceAgreementPdfBuffer(rawText);
    }

    await uploadToS3(pdfBuffer, s3Key);

    return {
        docType,
        docFileName,
        docS3Key:    s3Key,
        docMimeType: 'application/pdf',
        docFileSize: pdfBuffer.length,
        generatedBy,
    };
}

module.exports = { generateOnboardingDocument, resolveDocType, getS3Stream };

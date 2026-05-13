'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
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
const RULE_CLR = '#BBBBBB';
const TBL_HDR  = '#FFC000';   // amber — matches original template header row
const TBL_BOLD = '#E0E0E0';   // light grey for sub-header rows
const TBL_BORD = '#AAAAAA';

// ── Assets ────────────────────────────────────────────────────────────────────

const ASSETS_DIR   = path.join(__dirname, '../assets');
// JPEG copy of brand logo — PDFKit renders JPEG in full colour; PNG with alpha loses colour
const BRAND_LOGO   = path.join(__dirname, '../assets/logo_brand.jpg');

function getAsset(name) {
    const p = path.join(ASSETS_DIR, name);
    return fs.existsSync(p) ? p : null;
}

// ── Body font size ────────────────────────────────────────────────────────────

const BODY_SZ = 10.5;

// ── Date helpers ─────────────────────────────────────────────────────────────

// dd/mm/yyyy — used in service agreement (template uses numeric dates)
function fmtDateDMY(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${dt.getUTCFullYear()}`;
}

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
    if (c === 'GBP') return '\xa3 ';   // £ — WinAnsi 0xA3, safe with Times-Roman
    if (c === 'EUR') return '€ '; // € — WinAnsi 0x80, supported in Times-Roman
    return 'Rs. ';                      // INR default (₹ requires Unicode TTF not bundled)
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

// Format CTC / variable pay for the display line in the offer letter.
//   LPA (INR)        : "12 LPA"              — raw lakh figure, no currency prefix
//   Annual INR       : "Rs. 6,00,000 Annual" — absolute rupee amount
//   Annual non-INR   : "$ 64,000 Annual"     — amount × 1,000 (entered in thousands)
//   Monthly / Hourly : fmtAmount of the absolute figure + type label
function fmtCtcDisplay(amount, currencyName, compTypeName) {
    if (amount == null || amount === '') return 'As discussed';
    const c      = (currencyName || 'INR').trim().toUpperCase();
    const ct     = (compTypeName || 'LPA').trim();
    const ctl    = ct.toLowerCase();
    const isINR  = c === 'INR' || c === '';
    const num    = Number(amount);
    if (isNaN(num)) return `${amount} ${ct}`;

    if (ctl.includes('lpa')) {
        return `${num} ${ct}`;                           // "12 LPA"
    }
    if (!ctl.includes('month') && !ctl.includes('hour') && !isINR) {
        // Non-INR Annual: user enters thousands (64 = $64,000)
        const prefix    = getCurrencyPrefix(c);
        const formatted = Math.round(num * 1000).toLocaleString('en-US');
        return `${prefix}${formatted} ${ct}`;            // "$ 64,000 Annual"
    }
    // INR Annual / Monthly / Hourly, or non-INR Monthly / Hourly — absolute amount
    return `${fmtAmount(num, c)} ${ct}`;                 // "Rs. 6,00,000 Annual"
}

// ── Salary calculator ─────────────────────────────────────────────────────────
// LPA  (Lakhs Per Annum, INR only): amount is in lakhs → ×100,000 then ÷12.
// Annual: amount is the absolute annual figure (rupees for INR; thousands for
//         non-INR, e.g. 64 = $64,000).  Divide by 12 (with the 1,000 scaling
//         for non-INR).
// Monthly: amount is already monthly.
// Hourly:  amount × 160 hrs/month.
// Indian statutory components (PF, ESIC, PT, Gratuity) only applied for INR.

function calcSalary(amount, currencyName, compensationTypeName) {
    if (!amount || Number(amount) <= 0) return null;

    const amt      = Number(amount);
    const currency = (currencyName || 'INR').trim().toUpperCase();
    const compType = (compensationTypeName || '').trim().toLowerCase();
    const isINR    = currency === 'INR' || currency === '';

    // Derive exact annual CTC first so annual column figures are precise
    let annualCTC;
    if (compType.includes('hour')) {
        annualCTC = Math.round(amt * 160 * 12);
    } else if (compType.includes('month')) {
        annualCTC = Math.round(amt * 12);
    } else if (compType.includes('lpa')) {
        annualCTC = Math.round(amt * 100000);
    } else {
        // Annual — INR: absolute rupees; non-INR: entered in thousands
        annualCTC = isINR ? Math.round(amt) : Math.round(amt * 1000);
    }

    // Earnings: annual first for exact figures, monthly derived from annual
    //   Basic = 50% of CTC annual | HRA = 50% of Basic annual
    const annualBasic = Math.round(annualCTC  * 0.50);
    const annualHRA   = Math.round(annualBasic * 0.50);
    const basicM      = Math.round(annualBasic / 12);
    const hraM        = Math.round(annualHRA   / 12);

    // Employer contributions (INR only) — computed on annual basic for precision
    //   PF capped at ₹1,800/month (12% of Basic, EPFO ceiling ₹15,000)
    //   Gratuity = 4.81% of annual Basic
    const monthlyPF_er    = isINR ? Math.min(Math.round(basicM * 0.12), 1800) : 0;
    const annualPF_er     = monthlyPF_er * 12;
    const annualGratuity  = isINR ? Math.round(annualBasic * 0.0481) : 0;
    const monthlyGratuity = isINR ? Math.round(annualGratuity / 12) : 0;

    // Gross (A) = CTC − employer contributions; estimate gross to check ESIC
    const annualGross_est  = annualCTC - annualPF_er - annualGratuity;
    const monthlyGross_est = Math.round(annualGross_est / 12);
    const esicApplies      = isINR && monthlyGross_est <= 21000;
    const monthlyESIC_er   = esicApplies ? Math.round(monthlyGross_est * 0.0325) : 0;
    const annualESIC_er    = monthlyESIC_er * 12;

    const annualGross    = annualCTC - annualPF_er - annualGratuity - annualESIC_er;
    const monthlyGross   = Math.round(annualGross / 12);
    // Conveyance = Total CTC − Basic − HRA − Employer PF − Employer ESIC − Statutory Bonus − Gratuity
    const annualConv     = annualCTC - annualBasic - annualHRA - annualPF_er - annualESIC_er - annualGratuity;
    const monthlyConv    = Math.round(annualConv / 12);

    // Total Compensation (A+B): yearly = exact CTC entered, monthly = round(CTC/12)
    const monthlyTotComp = Math.round(annualCTC / 12);

    // Employee deductions
    const monthlyESIC_ee = esicApplies ? Math.round(monthlyGross * 0.0075) : 0;
    const annualESIC_ee  = monthlyESIC_ee * 12;
    const monthlyPT      = isINR ? 200 : 0;
    const annualTotDed   = annualPF_er + annualESIC_ee + (monthlyPT * 12);
    const monthlyTotDed  = Math.round(annualTotDed / 12);

    return {
        isINR,
        basic:    { m: basicM,          y: annualBasic },
        hra:      { m: hraM,            y: annualHRA },
        special:  { m: monthlyConv,     y: annualConv },
        gross:    { m: monthlyGross,    y: annualGross },
        epf_er:   { m: monthlyPF_er,    y: annualPF_er },
        esic_er:  { m: monthlyESIC_er,  y: annualESIC_er },
        gratuity: { m: monthlyGratuity, y: annualGratuity },
        tot_comp: { m: monthlyTotComp,  y: annualCTC },
        epf_ee:   { m: monthlyPF_er,    y: annualPF_er },
        esic_ee:  { m: monthlyESIC_ee,  y: annualESIC_ee },
        pt:       { m: monthlyPT,       y: monthlyPT * 12 },
        tot_ded:  { m: monthlyTotDed,   y: annualTotDed },
        net:      { m: monthlyGross - monthlyTotDed, y: annualGross - annualTotDed },
    };
}

// ── Shared page chrome (reused by both offer letter and service agreement) ────

function drawPageChrome(doc) {
    const logoSrc = fs.existsSync(BRAND_LOGO) ? BRAND_LOGO : getAsset('logo.png');
    const maxW    = CW * 0.4;
    const maxH    = HDR_LINE_Y - HDR_Y - 20;
    const logoX   = (PAGE_W - maxW) / 2;
    if (logoSrc) {
        doc.image(logoSrc, logoX, HDR_Y + 7, { fit: [maxW, maxH], align: 'center', valign: 'center' });
    } else {
        doc.fontSize(20).font('Times-Bold').fillColor('#1a1a6e')
           .text('aerolens', ML, HDR_Y + 20, { width: CW, align: 'center' });
    }
    doc.moveTo(ML, HDR_LINE_Y).lineTo(PAGE_W - MR, HDR_LINE_Y)
       .strokeColor(RULE_CLR).lineWidth(0.6).stroke();
    doc.moveTo(ML, FTR_LINE_Y).lineTo(PAGE_W - MR, FTR_LINE_Y)
       .strokeColor(RULE_CLR).lineWidth(0.6).stroke();
    doc.fontSize(9).font('Times-Bold').fillColor(BLACK)
       .text('Aerolens India Private Limited', ML, FTR_Y + 2, { width: CW, align: 'center' });
    doc.fontSize(7.5).font('Times-Roman').fillColor(DGRAY)
       .text('Brain Wire Block C, 11th Floor, Navratna Business Park, Near Sindhu Bhavan Road, Opp. GTPL House, Bodakdev, Ahmedabad - 380059',
             ML, FTR_Y + 14, { width: CW, align: 'center' })
       .text('www.aerolens.net   hr@aerolens.net',
             ML, FTR_Y + 26, { width: CW, align: 'center' });
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
        const ctcDisplay   = fmtCtcDisplay(offer.offeredCTCAmount, currencyName, compType);
        const salary       = calcSalary(offer.offeredCTCAmount, currencyName, compType);
        const fmt          = (n) => fmtAmount(n, currencyName);

        // ── Drawing primitives ────────────────────────────────────────────────

        function hRule(y, color) {
            doc.moveTo(ML, y).lineTo(PAGE_W - MR, y)
               .strokeColor(color || RULE_CLR).lineWidth(0.6).stroke();
        }

        function drawHeader() {
            const logoSrc  = fs.existsSync(BRAND_LOGO) ? BRAND_LOGO : logoPath;
            const maxW     = CW * 0.4;                         // 40% of content width
            const maxH     = HDR_LINE_Y - HDR_Y - 20;         // header height minus padding
            const logoX    = (PAGE_W - maxW) / 2;             // centre box on page
            if (logoSrc) {
                doc.image(logoSrc, logoX, HDR_Y + 7, { fit: [maxW, maxH], align: 'center', valign: 'center' });
            } else {
                doc.fontSize(20).font('Times-Bold').fillColor('#1a1a6e')
                   .text('aerolens', ML, HDR_Y + 20, { width: CW, align: 'center' });
            }
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
            doc.fontSize(opts.size || BODY_SZ)
               .font(opts.bold ? 'Times-Bold' : 'Times-Roman')
               .fillColor(BLACK)
               .text(text, ML, doc.y, {
                   width: CW,
                   align: opts.align || 'justify',
                   lineGap: 0,
               });
            doc.moveDown(opts.gap !== undefined ? opts.gap : 0.3);
        }

        // Bullet point using a drawn circle (avoids Unicode glyph issues).
        function bullet(text) {
            const y0     = doc.y;
            const indent = 18;
            doc.circle(ML + indent - 11, y0 + 6, 2.2).fill(BLACK);
            doc.fillColor(BLACK).fontSize(BODY_SZ).font('Times-Roman')
               .text(text, ML + indent, y0, { width: CW - indent, align: 'justify', lineGap: 0 });
            doc.moveDown(0.25);
        }

        // Inline "Bold label: " + normal body text on the same paragraph.
        function labelPara(boldLabel, normalText) {
            doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
               .text(boldLabel, ML, doc.y, { width: CW, continued: true, lineGap: 0 });
            doc.font('Times-Roman')
               .text(normalText, { align: 'justify', lineGap: 0 });
            doc.moveDown(0.3);
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
                tRow('Basic Wage',                  fmt(s.basic.m),    fmt(s.basic.y));
                tRow('HRA',                          fmt(s.hra.m),      fmt(s.hra.y));
                tRow('Conveyance Allowance',         fmt(s.special.m),  fmt(s.special.y));
                tRow('Gross Salary (A)',             fmt(s.gross.m),    fmt(s.gross.y),    { bold: true });
                tRow('Employer Contributions (B)',   '', '',             { bold: true });
                tRow("Employers' Contribution - Provident Fund", fmt(s.epf_er.m),  fmt(s.epf_er.y));
                tRow("Employers' Contribution - ESIC",           fmt(s.esic_er.m), fmt(s.esic_er.y));
                tRow('Statutory Bonus',              fmt(0),            fmt(0));
                tRow('Gratuity*',                    fmt(s.gratuity.m), fmt(s.gratuity.y));
                tRow('Total Compensation & Benefits (A+B)', fmt(s.tot_comp.m), fmt(s.tot_comp.y), { bold: true });
                tRow('Deductions',                   '', '',             { bold: true });
                tRow('Employee Contribution - Provident Fund', fmt(s.epf_ee.m),  fmt(s.epf_ee.y));
                tRow('Employee Contribution - ESIC',           fmt(s.esic_ee.m), fmt(s.esic_ee.y));
                tRow('Professional Tax',             fmt(s.pt.m),       fmt(s.pt.y));
                tRow('Total Deductions',             fmt(s.tot_ded.m),  fmt(s.tot_ded.y),  { bold: true });
                tRow('Net Pay',                      fmt(s.net.m),      fmt(s.net.y),      { bold: true, hdr: true });
            } else {
                ['Basic Wage', 'HRA', 'Conveyance Allowance'].forEach((l) => tRow(l, '', ''));
                tRow('Gross Salary (A)', '', '', { bold: true });
                tRow('Employer Contributions (B)', '', '', { bold: true });
                ["Employers' Contribution - Provident Fund",
                 "Employers' Contribution - ESIC",
                 'Statutory Bonus',
                 'Gratuity*'].forEach((l) => tRow(l, '', ''));
                tRow('Total Compensation & Benefits (A+B)', '', '', { bold: true });
                tRow('Deductions', '', '', { bold: true });
                ['Employee Contribution - Provident Fund',
                 'Employee Contribution - ESIC',
                 'Professional Tax'].forEach((l) => tRow(l, '', ''));
                tRow('Total Deductions', '', '', { bold: true });
                tRow('Net Pay',          '', '', { bold: true, hdr: true });
            }

            return y;
        }

        // ════════════════════════════════════════════════════════════════════
        // PAGE 1
        // ════════════════════════════════════════════════════════════════════
        newPage();

        // Date
        doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
           .text(`Date: ${letterDate}`, ML, doc.y);
        doc.moveDown(0.5);

        // Centred underlined heading
        doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
           .text('Offer Letter', ML, doc.y, { width: CW, align: 'center', underline: true });
        doc.moveDown(0.5);

        // Greeting
        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
           .text(`Dear ${offer.candidateName || '___________'},`, ML, doc.y);
        doc.moveDown(0.35);

        // Opening paragraph
        para(
            'On behalf of Aerolens India Pvt Ltd (hereinafter referred to as the "Company"), We are pleased ' +
            `to offer you the position of ${offer.jobRole || '___________'}. This letter sets forth the terms ` +
            'of our offer, which, if you accept, will govern your employment with the Company. Please note your ' +
            'employment with us is conditional and contingent upon your acceptance of this offer, as well as ' +
            'other terms set forth herein and/or Company policies as amended from time to time.'
        );

        // Employment start paragraph — inline bold placeholders
        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
           .text('Your employment will begin on ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Bold').text(startDate + ' ', { continued: true });
        doc.font('Times-Roman').text('and your work location will be ', { continued: true });
        doc.font('Times-Bold').text(offer.workModeName || '___________', { continued: true });
        doc.font('Times-Roman').text('. You will be reporting to ', { continued: true });
        doc.font('Times-Bold').text((rmLine || '___________') + ' ', { continued: true });
        doc.font('Times-Roman')
           .text('and our office located at Brain Wire Block C, 11th Floor, Navratna Business Park, Near Sindhu Bhavan Road, Opp. GTPL House, Bodakdev, Ahmedabad - 380059',
                 { align: 'justify', lineGap: 0 });
        doc.moveDown(0.3);

        // Working Schedule
        labelPara('Working Schedule: ',
            'This role involves ongoing responsibilities aligned with business needs and is not eligible for ' +
            'overtime compensation. The standard working hours are 02:00 PM to 11:00 PM, which may vary based ' +
            'on project, client, or location requirements. Employees may be required to work on weekends, when ' +
            'necessary, for which a compensatory day off will be provided in accordance with company policy. ' +
            'Employees are expected to meet agreed timelines in coordination with their manager. The organization ' +
            'is committed to fostering a performance-driven culture while supporting a healthy work-life balance.');

        // Probation
        doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
           .text('Probation: ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Roman').text('Your ', { continued: true });
        doc.font('Times-Bold').text('90 days ', { continued: true });
        doc.font('Times-Roman')
           .text(
               'of service following your training will be considered probationary and you will be appraised ' +
               'for satisfactory performance. If your performance is found unsatisfactory, Aerolens India Pvt Ltd ' +
               'may extend the probation period or terminate your employment with immediate effect. During the ' +
               'extension of the probation period, if your performance is still found unsatisfactory, Aerolens ' +
               'India Pvt Ltd shall be entitled to terminate your services forthwith without any notice whatsoever. ' +
               'If not communicated otherwise, after completion of the stipulated probation period, you will ' +
               'automatically be converted into a confirmed employee.',
               { align: 'justify', lineGap: 0 });
        doc.moveDown(0.3);

        // Separation
        doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
           .text('Separation: ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Roman').text('A minimum of ', { continued: true });
        doc.font('Times-Bold').text('3 (three) months\' notice period ', { continued: true });
        doc.font('Times-Roman')
           .text(
               'or salary in lieu of notice period is required for termination of employment terms by either ' +
               'side seeking the termination. However, it will be the discretion of management to accept the ' +
               'salary in lieu of the notice period or ask an employee to serve the notice period. Salary for ' +
               'the purpose of the notice period means total cost to the company (CTC). In case of incomplete ' +
               'assignment, the company has the discretion to relieve you only at the end of 3 months\' notice period.',
               { align: 'justify', lineGap: 0 });
        doc.moveDown(0.3);

        bullet('During the probation period, employees are required to give a minimum of 4 (Four) weeks\' notice period before separation.');
        bullet('Our compensation and benefit package or any discussion of the same is not a commitment that your employment will have a minimum or a fixed term or that it is terminable only for a cause. No promises can be expressed or implied by anyone, that your employment is for any minimum or fixed term or that cause is required for the termination of the employment relationship. By signing below, you acknowledge that your employment at the Company is for an unspecified duration, and neither this letter, nor your acceptance thereof, constitutes a contract for employment.');
        bullet('Upon separation from the Company for any reason, you agree to return to the Company any equipment that has been provided to you. The Company reserves the right to deduct such costs from any final payments to be made to you.');
        bullet('In the event of your leaving our company, for any reason, you shall return all the Company\'s documents, papers, disks, etc. to the authorized person of the Company. All manuals, literature, new systems, programmers, products etc. developed by you, while in Company service will always be deemed to be the sole property of the Company.');

        // ════════════════════════════════════════════════════════════════════
        // PAGE 2
        // ════════════════════════════════════════════════════════════════════
        newPage();

        // No Conflicts of Interest
        labelPara('No Conflicts of Interest: ',
            'By accepting this offer, you confirm that you have no existing legal, contractual, or other ' +
            'obligations that would prevent you from joining Aerolens India Pvt Ltd or performing your duties ' +
            'as described in this offer.');

        doc.moveDown(0.2);

        // Compensation heading
        para('Compensation and Benefits:', { bold: true, align: 'left', gap: 0.3 });

        // CTC line
        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
           .text('•  Total CTC ', ML + 14, doc.y, { continued: true, width: CW - 14, lineGap: 0 });
        doc.font('Times-Bold').text(ctcDisplay, { continued: true });
        doc.font('Times-Roman')
           .text('. As discussed and agreed upon mutually during your interview process. Salary break-up is as below.',
                 { align: 'justify', lineGap: 0 });
        doc.moveDown(0.3);

        if (offer.variablePay != null && Number(offer.variablePay) > 0) {
            const vpDisplay = fmtCtcDisplay(offer.variablePay, currencyName, compType);
            doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
               .text('Variable Pay: ', ML + 14, doc.y, { continued: true, width: CW - 14, lineGap: 0 });
            doc.font('Times-Roman')
               .text(
                   `A total of ${vpDisplay} will be allocated as variable pay, which will be disbursed in ` +
                   'two equal installments. 50% after six months and the remaining 50% in the following six ' +
                   'months. The disbursement will be subject to overall company performance and is at the sole ' +
                   'discretion of the management.',
                   { align: 'justify', lineGap: 0 });
            doc.moveDown(0.3);
        }

        if (offer.joiningBonus != null && Number(offer.joiningBonus) > 0) {
            const jbDisplay = fmt(offer.joiningBonus);
            doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
               .text('Joining Bonus Clause: ', ML + 14, doc.y, { continued: true, width: CW - 14, lineGap: 0 });
            doc.font('Times-Roman')
               .text(
                   `A one-time joining bonus of ${jbDisplay} will be extended as a token of appreciation for ` +
                   'choosing to join our team. This gesture reflects our commitment to recognizing talent and ' +
                   'welcoming you onboard with encouragement and support. This will be added in the first month payroll.',
                   { align: 'justify', lineGap: 0 });
            doc.moveDown(0.3);
        }

        doc.moveDown(0.1);

        // Salary table
        const tableEndY = drawSalaryTable(doc.y);
        doc.y = tableEndY + 3;

        doc.fontSize(8).font('Times-Roman').fillColor(DGRAY)
           .text('* Subject to applicability.', ML, doc.y);
        doc.moveDown(0.35);

        // Obligatory Deductions
        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
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
        doc.moveDown(0.3);

        // Benefits
        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
           .text('•  ', ML + 14, doc.y, { continued: true, width: CW - 14, lineGap: 0 });
        doc.font('Times-Bold').text('Benefits. ', { continued: true });
        doc.font('Times-Roman')
           .text(
               'As an employee, in addition to your compensation package, you will also be eligible to receive ' +
               'the benefits which are offered to all Company employees, as described below:',
               { align: 'justify', lineGap: 0 });
        doc.moveDown(0.3);

        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
           .text('A.  You are eligible for paid leaves as follows which will begin to earn immediately after ' +
               'joining and accrue monthly (total leave equally divided in 12 months)',
               ML + 22, doc.y, { width: CW - 22, align: 'justify', lineGap: 0 });
        doc.moveDown(0.3);

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
        doc.y = lY + 4;

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
            doc.fillColor(BLACK).fontSize(BODY_SZ).font('Times-Roman')
               .text(
                   'The Offer letter is issued / enclosed in duplicate, please sign the duplicate copy in ' +
                   'acknowledgment of your acceptance of the above stated terms and conditions and return to us by ',
                   ML + 18, y0, { continued: true, width: CW - 18, lineGap: 0 });
            doc.font('Times-Bold').text(signBefore + ' ', { continued: true });
            doc.font('Times-Roman')
               .text('after which the offer stands automatically withdrawn.',
                     { align: 'justify', lineGap: 0 });
            doc.moveDown(0.3);
        }

        para(
            'The appointment is subject to submission and positive verification of the following documents and ' +
            'background verification check conducted by Aerolens India Pvt Ltd approved agency.'
        );

        [
            'Signed Offer Letter.',
            'Latest passport sized photograph - 2 Nos.',
            'Soft copies of highest educational degree held & other professional qualification(s) certificates, if any.',
            'Soft copy of Residence Proof (Passport / Aadhar Card / Voter ID Card).',
            'Soft copy of Identity Proof (PAN card / Passport / Driving License / Voter ID).',
            'Relieving & Experience letter of previous 2 employments.',
        ].forEach(bullet);

        doc.moveDown(0.2);

        // Reporting Date
        doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
           .text('Reporting Date: ', ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Roman')
           .text('This appointment will take effect from the date of joining duty, which shall not be later than ',
                 { continued: true });
        doc.font('Times-Bold').text(startDate, { continued: true });
        doc.font('Times-Roman')
           .text('. It is the company\'s discretion to change the joining date based on mutual agreement between company and candidate.',
                 { align: 'justify', lineGap: 0 });
        doc.moveDown(0.35);

        para('Should you have any questions about joining the Company, please do not hesitate to contact the undersigned.');

        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
           .text('We are excited about the opportunity to work with you at ', ML, doc.y, { continued: true, lineGap: 0 });
        doc.font('Times-Bold').text('Aerolens India Pvt Ltd');
        doc.moveDown(0.4);

        para('Sincerely,', { align: 'left', gap: 0.2 });

        if (sigPath) {
            doc.image(sigPath, ML, doc.y, { width: 170 });
            doc.moveDown(0.3);
        } else {
            doc.moveDown(2.5);
        }

        para('Bhavin Trivedi', { bold: true, align: 'left', gap: 0.1 });
        para('Aerolens India Pvt Ltd', { bold: true, align: 'left' });

        // ════════════════════════════════════════════════════════════════════
        // PAGE 4
        // ════════════════════════════════════════════════════════════════════
        newPage();

        para('Acknowledgement:', { bold: true, align: 'left', gap: 0.5 });

        doc.fontSize(BODY_SZ).font('Times-Roman').fillColor(BLACK)
           .text(
               'I have read and accepted the terms and conditions outlined above. I agree to keep the terms of ' +
               'this letter confidential. As desired, I shall join services w.e.f. ',
               ML, doc.y, { continued: true, width: CW, lineGap: 0 });
        doc.font('Times-Bold').text(startDate);
        doc.moveDown(1.8);

        para('Name:', { bold: true, align: 'left', gap: 1.4 });

        // Signature / Date line
        doc.fontSize(BODY_SZ).font('Times-Bold').fillColor(BLACK)
           .text('Signature: ', ML, doc.y, { continued: true, lineGap: 0 });
        doc.font('Times-Roman').text('__________________________', { continued: true });
        doc.font('Times-Bold').text('   Date: ', { continued: true });
        doc.font('Times-Roman').text('_____________');

        doc.end();
    });
}

// ── Service Agreement body builder ───────────────────────────────────────────
// Returns the pre-filled document body directly — no AI call needed.
// All content is deterministic: the template is fixed and values are interpolated.

function buildServiceAgreementBody(offer) {
    const {
        candidateName     = '___________',
        jobRole           = '___________',
        offeredCTCAmount,
        currencyName,
        compensationTypeName,
        joiningDate,
        contractorAddress,
        workModeName,
    } = offer;

    const todayDMY = fmtDateDMY(new Date());
    const startDMY = joiningDate ? fmtDateDMY(new Date(joiningDate)) : '___________';
    // For Contractor: use their Aadhaar address. For Consultant: fall back to work location.
    const address  = (contractorAddress || '').trim() || (workModeName || '').trim() || '___________';

    // ctcLine is used by buildServiceAgreementPdf directly from offer — not needed here
    void offeredCTCAmount; void currencyName; void compensationTypeName;

    return `AGREEMENT OF SERVICE

This Agreement of Service is made on ${todayDMY} and shall be effective from ${startDMY} called for Services as per Statement of Work in Appendix A between

1. Aerolens India Private Limited whose registered address is Brain Wire Block C, 10th & 11th Floor, Navratna Business Park, Near Sindhu Bhavan Road, Opp. GTPL House, Bodakdev, Ahmedabad – 380059 ("Aerolens") and

2. ${candidateName}, with its place of business, office at, ${address} (Hereafter referred as "Consultant") hereby agree on the following terms:

RECITALS

WHEREAS AEROLENS has entered into a certain Master Services Agreement with their clients (hereinafter called the "Customer") for the execution of certain services around ${jobRole} (hereinafter called the "Services");

WHEREAS Aerolens desires to have the Consultant to execute, upon the terms hereinafter appearing, the Services to the Customer as a Consultant to Aerolens; and

WHEREAS, the Consultant agrees to execute the Services subject to the terms and conditions of this Agreement.

NOW THEREFORE, the parties HEREBY AGREE as follows:

1. THE SERVICES

1.1 The Consultant agrees and undertakes to execute and complete the Services as described in Appendix A of this Agreement. The Consultant shall exercise all reasonable skills, care and diligence in the execution and completion of the Services.

1.2 The Consultant shall provide all labor and materials, and everything required for the execution and completion of the Services.

2. PRICE AND TERMS OF PAYMENT

2.1 In consideration of Consultant executing and completing the Services in accordance with this Agreement, Aerolens agrees to pay the Consultant the price described in Appendix B of this Agreement.

2.2 Aerolens will make payment to the Consultant, in accordance with the terms and conditions of payment as stated in Appendix B of this Agreement.

3. TERM

3.1 The term for the execution and completion of the Services shall be commencing on the Effective Date and ending as per mutually agreed date or further extension thereafter.

4. RIGHTS GRANTED

4.1 Upon payment for the Services, the Consultant hereby grants the Customer a perpetual, non-exclusive, non-assignable, royalty free license to use for the Customer internal business operations, anything developed by the Consultant and delivered to the Customer under this Agreement.

5. OWNERSHIP AND RESTRICTIONS

5.1 The Customer shall own title and all property right (including Intellectual property rights) in all materials and deliverables, which are developed specifically for the Customer as a part of the Services.

6. WARRANTIES AND DISCLAIMERS

6.1 The Consultant warrants that, the Services will be provided in a professional manner consistent with internationally recognized industry standards. Aerolens must notify the Consultant of any warranty deficiencies within one (1) year from the performance of the Service described in the Appendix A of this Agreement.

6.2 For any breach of the warranty the Consultant's liability shall be the re-performance of the deficient Service or if the Consultant cannot substantially correct a breach in a commercially reasonable manner, Aerolens may end the relevant Service and recover fees paid to the Consultant for the deficient Service.

7. CONFIDENTIAL INFORMATION

7.1 This Agreement and all information disclosed under or in connection therewith, including the Customer information, shall be treated by the Consultant as confidential and shall not be divulged to any third parties without the prior written consent of the Aerolens. The Consultant shall ensure that the persons to whom such information is divulged shall themselves observe the requirements of this condition. Confidential information shall not include information that: (i) is or becomes a part of the public domain through no act or omission of the other party; (ii) was in the other party's lawful possession prior to the disclosure and had not been obtained by the other party either directly or indirectly from the disclosing party; (iii) is lawfully disclosed to the other party by a third party without restriction on the disclosure; or (iv) is independently developed by the other party.

7.2 The parties agree to hold confidential information disclosed under this Agreement, including the Customer information, in confidence for a period of two (2) years from the date of disclosure. Also, the parties agree to disclose confidential information only to those employees or agents who are required to protect it against unauthorized disclosure. Nothing shall prevent either party from disclosing the terms or pricing under this agreement or orders submitted under this agreement in any legal proceeding arising from or in connection with this agreement or disclosing the information to a federal or state governmental entity as required by law.

8. NON-COMPETE

8.1 During the term this Agreement is in effect and for a period of two (2) years thereafter, Consultant shall not seek to engage in the same customer project directly, for which Consultant has been contracted for, and bypass Aerolens as partner, unless both parties have reached prior written consent.

9. LIMITATION OF LIABILITY

9.1 Neither party shall be liable to the other for any indirect, incidental, consequential nor reliance damages (including lost profits), whether in contract or tort and whether or not such damages are foreseen. Except for breach of confidentiality, breach of intellectual property, negligence and willful misconduct, the maximum aggregate liability of the Consultant, if held legally liable, regardless of the nature or form of action giving rise to such liability (whether in contract, tort or otherwise) shall under no circumstances exceed the fees received by Contractor for the Services rendered under this Agreement.

10. FORCE MAJEURE

10.1 Neither Party shall be in breach of this Agreement if there is any total or partial failure of performance of its duties and obligations under this Agreement which results from Force Majeure Event. If the Force Majeure Event continues for a period of more than three calendar months and substantially affects the performance of this Agreement each Party shall have the right to terminate this Agreement upon giving written notice of such termination to the other Party, unless the Parties agree otherwise. For the purposes of this Clause "Force Majeure Event" means any act outside the reasonable control of a Party to this Agreement, which shall include acts of God, any war, armed conflict, national emergency, riots, civil commotion, fire, explosion, flood, epidemic, lock-outs, strikes or other industrial disputes, nuclear, chemical or biological contamination arising from such events; or acts of any governmental or supra-national authority.

11. PROGRAM AND SOFTWARE LICENSES

11.1 In case of ordering Services relevant to the implementation of software programs developed by a 3rd party vendor, end customer is fully responsible for ensuring that the Customer is complying with the terms of use imposed by the 3rd party vendor. The Consultant will not be responsible in any form or way for any breach of the terms of use of any 3rd party software.

12. ASSIGNMENT & SUBCONTRACTS

12.1 The Consultant shall not assign or otherwise transfer the Services or any benefit or interest therein, whether in whole or in part.

13. PUBLICITY

13.1 The Consultant shall NOT issue a news release, public announcement, advertisement, or any other form of publicity to the press or other public media concerning this Agreement or the subject matter thereof, without obtaining prior written approval from Aerolens.

14. INDEMNITIES

14.1 The Consultant shall at all times defend, hold harmless and indemnify Aerolens and the Customer against all liabilities, damages, losses or costs (including reasonable attorney's fees) arising from or in connection with any willful or negligent act or omission by the Consultant.

15. TERMINATION

15.1 If the Main Contract is terminated for any reason whatsoever before the Consultant has fully performed his obligations under this Agreement, then Aerolens may at any time thereafter by written notice to the Consultant forthwith terminate this Agreement without any liability. Upon such a termination of this Agreement (i) all rights and obligations of the parties shall cease to have effect (ii) each party shall return to the other party any Confidential Information; and (iii) Consultant shall be entitled to be paid the full value of the Services properly completed to the satisfaction of the Customer provided Aerolens have been paid by the customer for the delivered service.

15.2 This Agreement may, at any time during its term, be terminated by either party if the other party commits a material breach of any term or condition of this Agreement and fails to remedy such breach within ten (10) calendar days of being brought to the attention of the other party.

15.3 Either party may terminate this Agreement by written notice in writing upon bankruptcy of the other party.

15.4 Either party may terminate this Agreement by giving two months' notice in writing.

16. BENEFIT OF THE AGREEMENT

16.1 The rights and liabilities of the parties hereto shall bind and inure to the benefit of the parties and the successors and permitted assigns of each party.

17. COMPLETE UNDERSTANDING AND AMENDMENT

17.1 This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements and understandings between the parties, with respect to its subject matter and may not be amended unless mutually agreed in writing by both parties.

18. NOTICES

18.1 Any notices required hereunder shall be in writing, signed by the party giving it and shall be personally delivered, sent by courier, certified mail or by fax to the address of the party notified as set forth hereabove, or to such other address as that party may designate in writing. A notice shall be deemed to be received: (a) at the time of delivery, if delivered personally; (b) five (5) days following delivery, if sent by courier; (c) in the case of fax or email, on the day of transmission if sent before 3:30 p.m. on any business day and otherwise at 8:30 a.m. on the next business day provided that, at the time of transmission, an error-free transmission report has been received by the sender in case of fax and a confirmatory letter is sent by fax within twenty four (24) hours after the sending of the email in case the notice sent by email.

19. WAIVER

19.1 No waiver by a party of any right under this Agreement shall be valid unless such waiver is in writing and signed by the party waiving such right.

20. GOVERNING LAW and JURISDICTION

20.1 This Agreement shall be governed and construed in accordance with the India law. The Parties shall use all reasonable endeavors to negotiate in good faith at the highest executive levels to settle amicably any dispute of whatever nature arising in connection with this Agreement. If such executive negotiations for the amicable settlement are unsuccessful, the dispute arising shall be referred to the exclusive jurisdiction of the India competent courts.`;
}

// ── OpenRouter (Service Agreement review pass) ───────────────────────────────

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
            body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
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
    return content.trim(); // empty string is handled by caller — no throw here
}

// Builds a short review prompt for OpenRouter (body already pre-filled)
function buildServiceAgreementPrompt(body) {
    return (
        'You are a professional legal document reviewer for Aerolens India Private Limited.\n' +
        'Review the following Agreement of Service for correctness and professional quality.\n' +
        'Output ONLY the complete document text — no JSON, no markdown, no commentary, no changes to legal clauses.\n\n' +
        body
    );
}


function buildServiceAgreementPdf(rawBody, offer, attachments = {}) {
    return new Promise((resolve, reject) => {
        const doc    = new PDFDocument({ autoFirstPage: false, size: 'A4', margin: 0 });
        const chunks = [];
        doc.on('data',  (c) => chunks.push(c));
        doc.on('end',   ()  => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const sigPath       = getAsset('signature.png');
        const BOTTOM_LIMIT  = FTR_LINE_Y - 15;
        const SA_SZ         = 10.5;
        const INDENT_SUB    = 22;

        function newPage() {
            doc.addPage({ size: 'A4', margin: 0 });
            drawPageChrome(doc);
            doc.x = ML;
            doc.y = BODY_Y;
        }

        // Safe text block — auto-page-breaks before rendering
        function safeBlock(renderFn, estH = 40) {
            if (doc.y + estH > BOTTOM_LIMIT) newPage();
            renderFn();
        }

        function safeText(text, opts = {}) {
            const indent = opts.indent || 0;
            const w      = CW - indent;
            const h      = doc.heightOfString(text, { width: w, lineGap: 1 }) + 8;
            if (doc.y + h > BOTTOM_LIMIT) newPage();
            doc.fontSize(opts.size || SA_SZ)
               .font(opts.bold ? 'Times-Bold' : 'Times-Roman')
               .fillColor(opts.color || BLACK)
               .text(text, ML + indent, doc.y, {
                   width: w,
                   align: opts.align || 'justify',
                   lineGap: 1,
                   underline: opts.underline || false,
               });
            doc.moveDown(opts.gap !== undefined ? opts.gap : 0.15);
        }

        // ── Pages 1+ : body ─────────────────────────────────────────────────
        newPage();

        const paragraphs = rawBody.split(/\n{2,}/);
        for (const p of paragraphs) {
            const trimmed = p.trim();
            if (!trimmed) continue;

            if (/^AGREEMENT OF SERVICE$/i.test(trimmed)) {
                safeText('AGREEMENT OF SERVICE', { bold: true, align: 'center', size: 13, gap: 0.5, color: '#C00000' });
                continue;
            }

            // Numbered section header: ALL-CAPS after number ("1. THE SERVICES" ✓, "1. Aerolens..." ✗)
            const isNumberedHdr = /^\d+\.\s+[A-Z]{2}/.test(trimmed);
            const isRECITALS    = trimmed === 'RECITALS';
            const isWordHdr     = isRECITALS || trimmed === 'NOW THEREFORE';
            const isSectionHdr  = isNumberedHdr || isWordHdr;
            // Sub-section: "1.1 ...", "15.4 ..."
            const isSubSection  = /^\d+\.\d+\s/.test(trimmed);
            // Party list items: "1. Aerolens India..." or "2. [Name]..." (proper case, not ALL-CAPS)
            const isPartyItem   = /^\d+\.\s+[A-Z][a-z]/.test(trimmed);

            // Clear space before each section header
            if (isSectionHdr && doc.y > BODY_Y + 20) {
                if (doc.y + 20 > BOTTOM_LIMIT) newPage();
                else doc.moveDown(0.35);
            }

            const indent = isSubSection ? INDENT_SUB : (isPartyItem ? 14 : 0);
            safeText(trimmed, {
                bold:      isSectionHdr,
                underline: isRECITALS,
                indent,
                align:     isSectionHdr ? 'left' : 'justify',
                gap:       isSectionHdr ? 0.1 : 0.2,
            });
        }

        // ── Appendix A ───────────────────────────────────────────────────────
        newPage();

        safeText('Appendix A', { bold: true, align: 'center', size: 12, gap: 0.2 });
        safeText('Scope and Description of the Services', { bold: true, underline: true, align: 'center', size: 11, gap: 0.4 });
        safeText('Scope of Services', { bold: true, align: 'left', gap: 0.2 });
        safeText(
            `Consultant agrees to provide the professional consulting service on ${offer.jobRole || '___________'} ` +
            'project according to the agreed scope of work, offer, below roles and responsibility and project plan.',
            { gap: 0.25 }
        );
        safeText('Roles and Responsibility (Inclusive)', { bold: true, align: 'left', gap: 0.2 });

        const roleDesc = (offer.jobRole || '').toLowerCase();
        const roles = roleDesc.includes('backend') || roleDesc.includes('engineer') || roleDesc.includes('developer') ? [
            'Design, develop, and maintain scalable systems and APIs',
            'Work across the full SDLC, including requirement analysis, design, development, testing, deployment, and maintenance',
            'Write clean, efficient, and reusable code following best practices',
            'Collaborate with cross-functional teams (frontend, QA, DevOps, product)',
            'Optimize application performance, scalability, and security',
            'Troubleshoot, debug, and upgrade existing systems',
            'Participate in code reviews and ensure high-quality deliverables',
        ] : [
            `Deliver professional services in the capacity of ${offer.jobRole || 'the agreed role'}`,
            'Work according to the agreed scope, timelines, and quality standards',
            'Collaborate with Aerolens and customer teams as required',
            'Provide regular status updates and adhere to project plans',
            'Ensure deliverables meet the requirements agreed upon in this Agreement',
        ];

        roles.forEach((r) => {
            safeBlock(() => {
                const y0 = doc.y;
                doc.circle(ML + 7, y0 + 5.5, 2.2).fill(BLACK);
                doc.fillColor(BLACK).fontSize(SA_SZ).font('Times-Roman')
                   .text(r, ML + 16, y0, { width: CW - 16, align: 'justify', lineGap: 0 });
                doc.moveDown(0.25);
            }, 20);
        });

        doc.moveDown(0.4);
        safeText('Workplace and execution of professional services at Customer or Consultant offices', { bold: true, align: 'left', gap: 0.3 });

        const wm = (offer.workModeName || '').trim() || '___________';
        safeBlock(() => {
            const y0 = doc.y;
            doc.circle(ML + 7, y0 + 5.5, 2.2).fill(BLACK);
            doc.fillColor(BLACK).fontSize(SA_SZ).font('Times-Bold')
               .text(wm, ML + 16, y0, { width: CW - 16, lineGap: 0 });
            doc.moveDown(0.25);
        }, 20);

        // ── Appendix B — Consultant only (Contractor has no invoicing table) ──
        const isContractorType = (offer.employmentTypeName || '').toLowerCase().trim() === 'contractor';
        if (isContractorType) {
            // Skip Appendix B for contractors
            // Jump straight to signature page below
        }
        // Needed for both Appendix B (consultant only) and signature page (all types)
        const todayDMY = fmtDateDMY(new Date());
        const startDMY = offer.joiningDate ? fmtDateDMY(new Date(offer.joiningDate)) : '___________';

        if (!isContractorType) { newPage();

        safeText('Appendix B', { bold: true, align: 'center', size: 12, gap: 0.3 });
        safeText('Invoicing & Payment Term', { bold: true, align: 'center', size: 11, gap: 0.6 });
        const ctcFormatted = offer.offeredCTCAmount
            ? `${fmtAmount(offer.offeredCTCAmount, (offer.currencyName || 'INR').trim())} + GST/${(offer.compensationTypeName || 'Monthly').trim()}`
            : 'As discussed';
        const wml   = (offer.workModeName || '').toLowerCase();
        const conn  = wml.includes('remote')
            ? 'Remote Working using reliable broadband connection and good specification Laptop'
            : 'Onsite at designated work location';

        const appBRows = [
            [
                'Total Fixed Cost: ' + ctcFormatted + ' for the agreed consultant (' + (offer.candidateName || '___________') + ')\n' +
                '  •  Mode of Hiring: Full Time Contract\n' +
                '  •  Start date: ' + startDMY + '\n' +
                '  •  Work Timing: The standard working hours are 02:00 PM to 11:00 PM, which may vary based on project, client, or location requirements\n' +
                '  •  Designation: ' + (offer.jobRole || '___________') + '\n' +
                '  •  Payment Mode: Bank payment against monthly invoice\n' +
                '  •  Payment term: Maximum 30 days from receiving approved timesheet & correct invoice\n' +
                '  •  Connectivity: ' + conn,
            ],
            ['Above amount is inclusive of all the charges i.e. Consulting Fee, Technical Support, Functional Support, etc.'],
            ['Consultant (' + (offer.candidateName || '___________') + ') is required to fill Timesheet to record weekly time which shall be approved by PM'],
            [(offer.candidateName || '___________') + ' is expected to submit invoice at the end of each month or end of the assignment whichever is earlier, along with approved timesheet.'],
            [
                'Payment would be made at the completion of the work based on the approved timesheet & on receipt of signed invoice.\n' +
                'Payment will be processed within 30 days of acceptance of invoice through bank transfer.',
            ],
            [
                'Invoices must be addressed to\nAerolens India Private Limited\nbhavin.trivedi@aerolens.net\n' +
                'Attn: Mr. Bhavin Trivedi\nC/o Brain Wire Block C, 10th & 11th Floor, Navratna Business Park,\n' +
                'Near Sindhu Bhavan Road, Opp. GTPL House, Bodakdev, Ahmedabad – 380059\n' +
                'Mobile: +91 - 81410 09822\nGSTIN: 24ABBCA0868P1ZE',
            ],
        ];

        const col0W = 40;
        const col1W = CW - col0W;
        const tBord = TBL_BORD;

        appBRows.forEach((cols, idx) => {
            const cellText = cols[0];
            const h = Math.max(doc.heightOfString(cellText, { width: col1W - 10, lineGap: 1 }) + 14, 24);
            if (doc.y + h > BOTTOM_LIMIT) newPage();
            const rowY = doc.y;
            doc.rect(ML,          rowY, col0W, h).strokeColor(tBord).lineWidth(0.4).stroke();
            doc.rect(ML + col0W,  rowY, col1W, h).strokeColor(tBord).lineWidth(0.4).stroke();
            doc.fontSize(9).font('Times-Bold').fillColor(BLACK)
               .text(String(idx + 1), ML + 4, rowY + 6, { width: col0W - 8, align: 'center', lineBreak: false });
            doc.fontSize(8.5).font('Times-Roman').fillColor(BLACK)
               .text(cellText, ML + col0W + 5, rowY + 6, { width: col1W - 10, lineGap: 1 });
            doc.y = rowY + h;
        });
        } // end if (!isContractorType) — Appendix B

        // ── Signature page ───────────────────────────────────────────────────
        newPage();

        safeText('IN WITNESS WHEREOF, the parties have executed this Agreement on the written date.', { gap: 0.8 });

        const sigBoxW = (CW - 10) / 2;
        const sigBoxH = 160;
        const leftX   = ML;
        const rightX  = ML + sigBoxW + 10;
        const boxY    = doc.y;

        doc.rect(leftX,  boxY, sigBoxW, sigBoxH).strokeColor(TBL_BORD).lineWidth(0.4).stroke();
        doc.rect(rightX, boxY, sigBoxW, sigBoxH).strokeColor(TBL_BORD).lineWidth(0.4).stroke();

        // Left header
        doc.fontSize(9).font('Times-Bold').fillColor(BLACK)
           .text('AEROLENS INDIA PRIVATE LIMITED', leftX + 5, boxY + 6, { width: sigBoxW - 10 });
        // Right header
        doc.fontSize(9).font('Times-Bold').fillColor(BLACK)
           .text('CONSULTANT', rightX + 5, boxY + 6, { width: sigBoxW - 10 });

        // Aerolens signature image
        if (sigPath) {
            doc.image(sigPath, leftX + 5, boxY + 22, { width: 120 });
        }

        const lineY    = boxY + 88;
        const lineGap  = 19;

        // Signature lines
        doc.moveTo(leftX  + 5, lineY).lineTo(leftX  + sigBoxW - 5, lineY).strokeColor(BLACK).lineWidth(0.5).stroke();
        doc.moveTo(rightX + 5, lineY).lineTo(rightX + sigBoxW - 5, lineY).strokeColor(BLACK).lineWidth(0.5).stroke();
        doc.fontSize(8).font('Times-Roman').fillColor(BLACK)
           .text('(Authorised Signature)', leftX  + 5, lineY + 2, { width: sigBoxW - 10 })
           .text('(Authorised Signature)', rightX + 5, lineY + 2, { width: sigBoxW - 10 });

        // Printed names
        doc.fontSize(8.5).font('Times-Roman').fillColor(BLACK)
           .text('Printed Name: ', leftX + 5, lineY + lineGap, { continued: true, width: sigBoxW - 10 });
        doc.font('Times-Bold').text('BHAVIN TRIVEDI');
        doc.fontSize(8.5).font('Times-Roman').fillColor(BLACK)
           .text('Printed Name: ', rightX + 5, lineY + lineGap, { continued: true, width: sigBoxW - 10 });
        doc.font('Times-Bold').text((offer.candidateName || '___________').toUpperCase());

        // Title/Position
        doc.fontSize(8.5).font('Times-Roman').fillColor(BLACK)
           .text('Title/Position: Head of Engineering', leftX + 5, lineY + lineGap * 2, { width: sigBoxW - 10 });
        doc.fontSize(8.5).font('Times-Roman').fillColor(BLACK)
           .text('Title/Position: ', rightX + 5, lineY + lineGap * 2, { continued: true, width: sigBoxW - 10 });
        doc.font('Times-Bold').text(offer.jobRole || '___________');

        // Date of signature
        doc.fontSize(8.5).font('Times-Roman').fillColor(BLACK)
           .text('Date of Signature: ', leftX + 5, lineY + lineGap * 3, { continued: true, width: sigBoxW - 10 });
        doc.font('Times-Bold').text(todayDMY);
        doc.fontSize(8.5).font('Times-Roman').fillColor(BLACK)
           .text('Date of Signature:', rightX + 5, lineY + lineGap * 3, { width: sigBoxW - 10 });

        // ── Attachment page — Consultant only (with uploaded images) ────────
        const { professionalPhoto, aadhaarFront, aadhaarBack, panCard } = attachments;
        if (!isContractorType) {
            newPage();
            // Reset PDFKit persistent lineGap state accumulated from body text —
            // without this, lineGap:1 inherited from safeText() corrupts image placement
            doc.lineGap(0);
            doc.fillColor(BLACK);

            // Helper: write buffer to temp file then embed via path (more reliable than raw Buffer)
            function placeImage(buf, x, y, w, h, label) {
                if (buf) {
                    const ext     = (buf[0] === 0xFF && buf[1] === 0xD8) ? '.jpg' : '.png';
                    const tmpFile = path.join(os.tmpdir(), `aerolens_attach_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
                    let placed = false;
                    try {
                        fs.writeFileSync(tmpFile, buf);
                        doc.fillColor(BLACK);
                        doc.image(tmpFile, x + 2, y + 2,
                            { fit: [w - 4, h - 4], align: 'center', valign: 'center' });
                        placed = true;
                    } catch { /* fall through to label */ }
                    finally {
                        try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
                    }
                    if (!placed) {
                        doc.fontSize(8).font('Times-Roman').fillColor(DGRAY)
                           .text(label, x, y + h / 2 - 5, { width: w, align: 'center', lineGap: 0 });
                    }
                } else {
                    doc.fontSize(8).font('Times-Roman').fillColor(DGRAY)
                       .text(label, x, y + h / 2 - 5, { width: w, align: 'center', lineGap: 0 });
                }
                doc.fillColor(BLACK);
            }

            // All y-positions are fixed from BODY_Y — not dependent on doc.y
            const photoW = 130, photoH = 110;
            const photoX = ML + (CW - photoW) / 2;
            const photoY = BODY_Y;
            doc.rect(photoX, photoY, photoW, photoH).strokeColor(TBL_BORD).lineWidth(0.5).stroke();
            placeImage(professionalPhoto, photoX, photoY, photoW, photoH, 'Professional Photo');
            doc.fontSize(8).font('Times-Roman').fillColor(DGRAY)
               .text('Professional Photo', photoX, photoY + photoH + 4,
                     { width: photoW, align: 'center', lineGap: 0 });

            const idW = (CW - 10) / 2, idH = 120;
            const aY  = photoY + photoH + 24;
            doc.rect(ML,            aY, idW, idH).strokeColor(TBL_BORD).lineWidth(0.5).stroke();
            doc.rect(ML + idW + 10, aY, idW, idH).strokeColor(TBL_BORD).lineWidth(0.5).stroke();
            placeImage(aadhaarFront, ML,           aY, idW, idH, 'Aadhaar Card Front');
            placeImage(aadhaarBack,  ML + idW + 10, aY, idW, idH, 'Aadhaar Card Back');
            doc.fontSize(8).font('Times-Roman').fillColor(DGRAY)
               .text('Aadhaar Card Front', ML,            aY + idH + 4, { width: idW, align: 'center', lineGap: 0 })
               .text('Aadhaar Card Back',  ML + idW + 10, aY + idH + 4, { width: idW, align: 'center', lineGap: 0 });

            const panW = 160, panH = 110;
            const panX = ML + (CW - panW) / 2;
            const panY = aY + idH + 24;
            doc.rect(panX, panY, panW, panH).strokeColor(TBL_BORD).lineWidth(0.5).stroke();
            placeImage(panCard, panX, panY, panW, panH, 'Owner Pan Card');
            doc.fontSize(8).font('Times-Roman').fillColor(DGRAY)
               .text('Owner Pan Card', panX, panY + panH + 4,
                     { width: panW, align: 'center', lineGap: 0 });
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
        // Pre-fill all dynamic fields into the document body deterministically
        const preBuiltBody = buildServiceAgreementBody(offerDetails);
        // Pass through OpenRouter for a professional review pass; fall back to
        // the pre-built body if the model returns empty or the call fails.
        let finalBody = preBuiltBody;
        try {
            const prompt  = buildServiceAgreementPrompt(preBuiltBody);
            const aiText  = await callOpenRouter(prompt);
            if (aiText) finalBody = aiText;
        } catch {
            // OpenRouter unavailable or model error — use pre-built body as-is
        }
        pdfBuffer = await buildServiceAgreementPdf(finalBody, offerDetails);
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

async function generateOnboardingDocumentWithAttachments(offerDetails, generatedBy, attachments) {
    const docType = resolveDocType(offerDetails.employmentTypeName);
    if (!docType) {
        throw new AppError(
            `Cannot determine document type for employment type: "${offerDetails.employmentTypeName}"`,
            400, 'UNKNOWN_EMPLOYMENT_TYPE'
        );
    }

    const generatedAt = new Date();
    const timestamp   = generatedAt.getTime();
    const safeName    = (offerDetails.candidateName || 'candidate')
                            .toLowerCase().replace(/[^a-z0-9]/g, '_');
    const docFileName = `${docType}_${safeName}_${timestamp}.pdf`;
    const s3Key       = `${S3_DOC_FOLDER}offer_${offerDetails.offerId}_${timestamp}.pdf`;

    const preBuiltBody = buildServiceAgreementBody(offerDetails);
    let finalBody = preBuiltBody;
    try {
        const prompt = buildServiceAgreementPrompt(preBuiltBody);
        const aiText = await callOpenRouter(prompt);
        if (aiText) finalBody = aiText;
    } catch {
        // fall back to pre-built body
    }

    const pdfBuffer = await buildServiceAgreementPdf(finalBody, offerDetails, attachments);
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

module.exports = { generateOnboardingDocument, generateOnboardingDocumentWithAttachments, resolveDocType, getS3Stream };

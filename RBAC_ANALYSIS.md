# RBAC Phase 0 Analysis - Aerolens Backend

Date: 2026-04-07  
Workspace: `D:\Aerolens-Backend`

This document captures mandatory Phase 0 findings before RBAC implementation.

## 0.1 Project Structure and Current Stack

### Root directory tree (depth 3)

Note: tree below excludes very large/generated folders (`node_modules`, `.git`, `coverage`, `uploads`) for readability.

```text
.
├── .github
│   └── workflows
│       ├── deploy-dev.yaml
│       └── deploy-prod.yaml
├── __tests__
│   ├── authenticationTests
│   │   ├── helpers
│   │   ├── integration
│   │   └── unit
│   ├── repositories
│   ├── services
│   └── validator
├── certs
├── config
├── controllers
├── docs
├── jobs
├── middleware
├── migrations
├── queues
├── repositories
├── routes
├── scripts
├── services
├── utils
├── validators
├── workers
├── appForTest.js
├── db.js
├── final_dump.sql
├── package.json
├── readme.md
└── server.js
```

### Files under `/src/routes` or `/pages`

No application `src/` tree exists in this repository.  
No files found under:
- `/src/routes`
- `/src/pages`

### Files under `/src/components` related to User/Role/Candidate/Interview

No application `src/components` directory exists in this repository.

### Backend route/controller files and naming conventions

#### Route files (`/routes`)
- `authRoutes.js`
- `candidateRoutes.js`
- `client.js` (legacy; not mounted in `server.js`)
- `clientMVC.js` (mounted)
- `contact.js`
- `department.js`
- `interviewRoutes.js`
- `jobProfileRequirementRoutes.js`
- `jobProfileRoutes.js`
- `locationRoutes.js`
- `lookupRoutes.js`
- `memberRoutes.js`
- `offerRoutes.js`
- `vendorRoutes.js`
- `webhookRoutes.js`
- `whatsappRoutes.js`

#### Controller files (`/controllers`)
- `authController.js`
- `candidateBulkController.js`
- `candidateController.js`
- `clientController.js`
- `contactController.js`
- `departmentController.js`
- `interviewController.js`
- `jobProfileController.js`
- `jobProfileRequirementController.js`
- `locationController.js`
- `lookupController.js`
- `memberController.js`
- `offerController.js`
- `resumeBulkUploadController.js`
- `vendorController.js`
- `webhookController.js`
- `whatsappController.js`

#### Naming convention summary
- Route files: mostly `<module>Routes.js` (some legacy plain names like `department.js`).
- Controllers: `<module>Controller.js`.
- Services: `<module>Service.js`.
- Repositories: `<module>Repository.js`.

### ORM in use

No ORM (no Prisma/TypeORM/Sequelize/Drizzle) is present.  
Data layer is **raw SQL** via `mysql2` promise pool (`db.js`) with repository classes.

### Auth library in use

- JWT: `jsonwebtoken`
- Passport strategy configured: `passport-jwt` in `config/passport.js`
- Actual route protection uses custom middleware `middleware/authMiddleware.js` (`authenticate`) calling `authService.verifyToken`

### Frontend framework and state management

Not present in this repository.  
No React/Next/Vue frontend source, no Redux/Zustand/Context app code detected.

### Existing User model schema and `IsInterviewer` / `IsRecruiter`

User table is `member` (repository-backed). Relevant fields used in code:
- `member.memberId`
- `member.memberName`
- `member.email`
- `member.designation`
- `member.isRecruiter`
- `member.isInterviewer`
- `member.isActive`
- `member.vendorId`

Evidence:
- `repositories/memberRepository.js` selects `isRecruiter` and `isInterviewer`
- `validators/authValidator.js` and `validators/memberValidator.js` accept `isRecruiter` and `isInterviewer`
- `authMiddleware` attaches `designation` and `isRecruiter` to `req.user`

---

## 0.2 Existing Auth Flow (Login -> JWT -> Protected Route -> DB)

### Login flow

1. `POST /auth/login` (`routes/authRoutes.js`)
2. `authController.login` -> `authService.login(email, password, userAgent, ipAddress)`
3. `authService.login`:
   - `memberRepository.findByEmail(email)`
   - bcrypt password compare
   - `generateToken(memberId, email, tokenFamily, jti)`
   - `tokenRepository.storeToken(...)` in `active_token`
   - `memberRepository.updateLastLogin(...)`
4. Response contains:
   - `member` object (includes `designation`, `isRecruiter`)
   - `token`
   - `expiresIn`

### JWT payload currently carries

From `services/authServices.js -> generateToken`:
- `sub`
- `memberId`
- `email`
- `jti`
- `family`
- `type` (`access`)
- `iat`

It currently does **not** include:
- `roleId`
- `roleName`
- `module permissions map`

### Protected route guard behavior today

Primary guard: `authenticate` middleware in `middleware/authMiddleware.js`.

`authenticate` does:
1. Extracts `Bearer` token from Authorization header
2. Calls `authService.verifyToken(token)` (JWT verify + revocation check)
3. Fetches live member from DB: `memberRepository.findById(decoded.memberId)`
4. Checks `isActive`
5. Attaches:
   - `memberId`
   - `email`
   - `memberName`
   - `designation`
   - `isRecruiter`
   - token metadata

Then route-level business logic performs DB queries through service/repository.

### Authorization middleware currently

`authorize(...allowedRoles)` exists, but:
- Used only on `/auth/register`
- Logic is currently inverted (returns FORBIDDEN when role is allowed)
- Not used for module/action-level permissions anywhere else

### How frontend reads user identity today

Frontend code is not present in this repo. Based on backend contract:
- Identity is returned from `/auth/login` response (`data.member`)
- Identity is also returned by `/auth/profile` (`req.user` projection)

---

## 0.3 Module/Page Inventory for Permission Gating

### Requested navigation groups (Home/Master/Transaction/Reports)

No frontend navigation config exists in this repository, so these groups are not directly discoverable from UI code.

### Backend modules inferred from mounted route prefixes (`server.js`)

- `/client`
- `/department`
- `/contact`
- `/jobProfile`
- `/jobProfileRequirement`
- `/candidate`
- `/lookup`
- `/member`
- `/location`
- `/interview`
- `/vendor`
- `/offers`
- `/whatsapp`
- `/webhook`
- `/auth`

### Cross-reference with Manage Permissions mockup modules

Mockup module | Backend presence
---|---
Resume/Candidate | Present (`/candidate`)
Job Profile | Present (`/jobProfile`)
Interview | Present (`/interview`)
Job Profile Requirements | Present (`/jobProfileRequirement`)
Members | Present (`/member`)
Vendor | Present (`/vendor`)
RBAC | **Not present** (no role/permission module exists yet)

`Home` route/module is not represented in backend route files (likely frontend-only concept).

---

## 0.4 Action Types per Module (Current API Surface)

Action mapping below is derived from route methods and endpoint purposes.

### Candidate (`/candidate`)
- `canView`: list/get candidate, get form data, resume info/download/preview
- `canAdd`: create candidate, bulk upload endpoints
- `canEdit`: patch candidate, upload/replace/delete resume, patch-vendors bulk operation
- `canDelete`: delete candidate
- Custom actions:
  - `canBulkUploadCandidates`
  - `canBulkUploadResumes`
  - `canDownloadResume`
  - `canPreviewResume`

### Job Profile (`/jobProfile`)
- `canView`: list/get profile, get JD info, download/preview JD
- `canAdd`: create profile
- `canEdit`: patch profile, upload/delete JD
- `canDelete`: delete profile
- Custom actions:
  - `canManageJD` (upload/preview/download/delete JD)

### Job Profile Requirement (`/jobProfileRequirement`)
- `canView`: list/get requirement
- `canAdd`: create requirement
- `canEdit`: patch requirement
- `canDelete`: delete requirement

### Interview (`/interview`)
- `canView`: list/get interview, by candidate, create-data/finalize-data, report endpoints
- `canAdd`: create interview, schedule next round
- `canEdit`: patch interview
- `canDelete`: delete interview
- Custom actions:
  - `canFinalizeResult` (`PUT /:interviewId/finalize`)
  - `canViewReports` (tracker/overall/monthly/daily/workload)
  - `canViewCapacity`

### Member (`/member`)
- `canView`: list/get member, form-data/create-data
- `canAdd`: currently via `/auth/register` (not `/member`)
- `canEdit`: patch member
- `canDelete`: delete member (deactivate)

### Vendor (`/vendor`)
- `canView`: list/get vendor
- `canAdd`: create vendor
- `canEdit`: patch vendor
- `canDelete`: delete vendor

### Offer (`/offers`)
- `canView`: list/get details/get form data
- `canAdd`: create offer
- `canEdit`: revise/terminate/status updates
- `canDelete`: soft-delete offer
- Custom actions:
  - `canReviseOffer`
  - `canTerminateOffer`
  - `canUpdateOfferStatus`

### Master data modules (`/client`, `/department`, `/contact`, `/location`, `/lookup`)
- Standard CRUD-type action patterns exist on each route group.

---

## 0.5 Sensitive Fields to Mask by Role (Observed in Current Models/DTO-like outputs)

No explicit role-based serializer/DTO masking exists today; controllers return repository rows directly.

### Candidate-related sensitive fields observed
- `currentCTC`
- `expectedCTC`
- `currentCTCAmount`
- `currentCTCCurrencyId`
- `currentCTCTypeId`
- `expectedCTCAmount`
- `expectedCTCCurrencyId`
- `expectedCTCTypeId`
- `notes`
- `referredBy`
- resume storage identifiers: `resumeFilename`, `resumeOriginalName`

### Interview-related sensitive fields observed
- `recruiterNotes`
- `interviewerFeedback`
- `meetingUrl` (closest existing field to "recording link"-type confidentiality)

### Offer-related sensitive fields observed
- `offeredCTCAmount`
- `variablePay`
- `joiningBonus`
- `offerLetterSent`
- `serviceAgreementSent`
- `ndaSent`
- `codeOfConductSent`
- status history document fields:
  - `signedOfferLetterReceived`
  - `signedServiceAgreementReceived`
  - `signedNDAReceived`
  - `signedCodeOfConductReceived`
  - `rejectionReason`

### Fields explicitly searched but not found as-is

The following literal names were not found in current backend models/queries:
- `interviewRecordingLink`
- `internalNotes`
- `salary` (as a direct column name)
- `offerLetterUrl`

---

## 0.6 Data Assignment Patterns (Row-Level Scoping Inputs)

### Candidate assignment to Recruiter

Current assignment field is `candidate.recruiterId` (used throughout candidate repository/service/validator).

Not found:
- `assignedRecruiterId` (exact name)
- `ownerId`
- `createdBy` on candidate table

Conclusion:
- Existing system already has recruiter linkage via `recruiterId`.
- If strict naming is required for Phase 5 spec, `assignedRecruiterId` would need migration + backfill from `recruiterId`.
- Alternatively, scope logic can be implemented on existing `recruiterId` to avoid duplicate ownership columns.

### Interview assignment to Interviewer

Current assignment field is `interview.interviewerId` (already present and heavily used).

Also present:
- `scheduledById` (scheduler metadata; not ownership)

Conclusion:
- Interview row-level scope can be implemented immediately on `interviewerId`.

---

## Additional Phase 0 Observations / Risks

1. `migrations/` directory exists but is currently empty (no formal migration history in repo).
2. `final_dump.sql` appears outdated relative to current code (does not contain all actively used tables like `interview` / `offer`).
3. Frontend code required for Phase 7/8/9 is not present in this workspace.
4. Current auth role gate (`authorize`) has a logic bug and is only used on register endpoint.
5. No reusable module/action permission middleware exists yet.
6. No field-level response serializer layer exists yet.

---

## Phase 0 Completion Status

Phase 0 analysis complete.  
`RBAC_ANALYSIS.md` created as required before implementation.


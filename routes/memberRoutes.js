const express = require('express');
const MemberController = require('../controllers/memberController');
const MemberService = require('../services/memberService');
const MemberRepository = require('../repositories/memberRepository');
const MemberValidator = require('../validators/memberValidator');
const { authenticate } = require('../middleware/authMiddleware');
const db = require('../db');
const auditContextMiddleware = require('../middleware/auditContext');

const router = express.Router();

const memberRepository = new MemberRepository(db);
const memberService = new MemberService(memberRepository, db);
const memberController = new MemberController(memberService);
router.use(authenticate);
router.use(auditContextMiddleware);


router.get('/',
    memberController.getAll
);

router.get('/form-data',
    memberController.getFormData
);

router.patch('/:memberId',
    MemberValidator.validateUpdate,
    memberController.updateMember
);

router.get('/:memberId',
    MemberValidator.validateParams,
    memberController.getById
);

router.delete('/:memberId',
    MemberValidator.validateDelete,
    memberController.deleteMember
);

module.exports = router;
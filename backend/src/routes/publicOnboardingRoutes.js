const express = require('express');
const router = express.Router();
const publicOnboardingController = require('../controllers/publicOnboardingController');

router.post('/society', publicOnboardingController.createSociety);

module.exports = router;

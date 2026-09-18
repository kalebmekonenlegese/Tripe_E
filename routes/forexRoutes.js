const express = require('express');
const { rates } = require('../controllers/forexController');

const router = express.Router();
router.get('/rates', rates);

module.exports = router;

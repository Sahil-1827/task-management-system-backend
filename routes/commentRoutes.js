const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { addComment, getComments, deleteComment, togglePin } = require('../controllers/commentController');

module.exports = (io) => {
    router.use(protect);
    router.post('/', (req, res) => addComment(req, res, io));
    router.get('/task/:taskId', getComments);
    router.put('/:id/pin', (req, res) => togglePin(req, res, io));
    router.delete('/:id', (req, res) => deleteComment(req, res, io));
    return router;
};

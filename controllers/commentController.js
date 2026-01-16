const Comment = require('../models/Comment');
const Task = require('../models/Task');

const addComment = async (req, res, io) => {
    try {
        const { text, taskId, replyTo } = req.body;

        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        const comment = await Comment.create({
            text,
            task: taskId,
            user: req.user._id,
            replyTo: replyTo || null
        });

        const populatedComment = await Comment.findById(comment._id)
            .populate('user', 'name profilePicture')
            .populate({
                path: 'replyTo',
                select: 'text user',
                populate: { path: 'user', select: 'name' }
            });

        if (io) {
            io.to(taskId).emit('commentAdded', populatedComment);
        }

        res.status(201).json(populatedComment);
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ error: error.message });
    }
};

const getComments = async (req, res) => {
    try {
        const { taskId } = req.params;
        const comments = await Comment.find({ task: taskId })
            .populate('user', 'name profilePicture')
            .populate({
                path: 'replyTo',
                select: 'text user',
                populate: { path: 'user', select: 'name' }
            })
            .sort({ createdAt: 1 });

        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ error: error.message });
    }
};

const deleteComment = async (req, res, io) => {
    try {
        const { id } = req.params;
        const comment = await Comment.findById(id);

        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        if (comment.user.toString() !== req.user._id.toString() && req.user.role === 'user') {
            return res.status(403).json({ message: 'Not authorized to delete this comment' });
        }

        await comment.deleteOne();

        if (io) {
            io.to(comment.task.toString()).emit('commentDeleted', id);
        }

        res.json({ message: 'Comment deleted' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    addComment,
    getComments,
    deleteComment
};

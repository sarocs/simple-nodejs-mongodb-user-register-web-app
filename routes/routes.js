const express = require('express');
const router = express.Router();
const User = require('../models/users');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

router.get('/contact', (req, res)=>{res.render('contact', {title: 'Contact Us'});});
router.get('/about', (req, res)=>{res.render('about', {title: 'About Us'});});
router.get('/add', (req, res)=>{res.render('add_users', {title: 'Add Users'});});


// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, './uploads');
    },
    filename: function(req, file, cb) {
        cb(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
    }
});

const upload = multer({ storage: storage }).single('image');
const uploadsDir = path.resolve(__dirname, '../uploads');

async function cleanupUploadedFile(file) {
    if (!file || !file.path) {
        return;
    }

    try {
        await fs.promises.unlink(file.path);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error deleting uploaded file:', error);
        }
    }
}

async function cleanupUploadedFileByName(filename) {
    if (!filename) {
        return;
    }

    const normalizedFilename = path.basename(filename);
    if (normalizedFilename !== filename) {
        console.warn('Blocked unsafe image filename for deletion:', filename);
        return;
    }

    const targetPath = path.resolve(uploadsDir, normalizedFilename);
    if (!targetPath.startsWith(uploadsDir + path.sep)) {
        console.warn('Blocked path traversal attempt for deletion:', filename);
        return;
    }

    try {
        await fs.promises.unlink(targetPath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error deleting image file:', error);
        }
    }
}

// Fetch users with pagination, sorting, and search
router.get('/', async (req, res) => {
    try {
        // Pagination settings
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Sorting settings
        const sortField = req.query.sort || 'name'; // Default sorting field
        const sortOrder = req.query.order === 'desc' ? -1 : 1; // Default sorting order

        // Search settings
        const search = req.query.search || '';
        const query = search ? { name: { $regex: search, $options: 'i' } } : {};

        // Fetch users with pagination, sorting, and search
        const users = await User.find(query)
            .skip(skip)
            .limit(limit)
            .sort({ [sortField]: sortOrder });

        // Get total count of documents for pagination
        const totalUsers = await User.countDocuments(query);

        res.render('index', {
            title: 'Home Page',
            users: users,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / limit),
            limit: limit,
            sortField: sortField,
            sortOrder: sortOrder,
            search: search
        });
    } catch (error) {
        res.json({ message: error.message });
    }
});

// Insert user into database
router.post('/add', upload, async (req, res) => {
    try {
        if (!req.body.email.includes("@")) {
            await cleanupUploadedFile(req.file);
            res.redirect('/');
            return;
        }

        const user = new User({
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone,
            image: req.file ? req.file.filename : 'user_unknown.png'
        });
        await user.save();
        req.session.message = {
            type: 'success',
            message: 'User added successfully'
        };
    } catch (error) {
        await cleanupUploadedFile(req.file);
        req.session.message = {
            type: 'danger',
            message: error.message
        };
    }
    res.redirect('/');
});

// Edit user
router.get('/edit/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (user) {
            res.render('edit_user', {
                title: 'Edit User',
                user: user
            });
        } else {
            res.redirect('/');
        }
    } catch (error) {
        req.session.message = {
            type: 'danger',
            message: error.message
        };
        res.redirect('/');
    }
});

// Update user
router.post('/update/:id', upload, async (req, res) => {
    try {
        const oldImage = req.body.old_image;
        let newImage = oldImage;

        if (req.file) {
            newImage = req.file.filename;

            // Delete the old image file if it exists
            if (oldImage) {
                await cleanupUploadedFileByName(oldImage);
            }
        }

        const updatedUser = await User.findByIdAndUpdate(req.params.id, {
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone,
            image: newImage
        }, { new: true });

        if (updatedUser) {
            req.session.message = {
                type: 'success',
                message: 'User updated successfully!'
            };
        }
    } catch (error) {
        req.session.message = {
            type: 'danger',
            message: error.message
        };
    }
    res.redirect('/');
});

// Delete user
router.get('/delete/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (user) {
            if (user.image) {
                await cleanupUploadedFileByName(user.image);
            }
            req.session.message = {
                type: 'info',
                message: 'User deleted!'
            };
        }
    } catch (error) {
        req.session.message = {
            type: 'danger',
            message: error.message
        };
    }
    res.redirect('/');
});

module.exports = router;

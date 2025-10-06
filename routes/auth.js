const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const router = express.Router();

// Tampilkan halaman register
// GET /register
router.get('/register', (req, res) => {
    res.render('register', { error: null });
});

// Proses data register
// POST /register
router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.render('register', { error: 'Username sudah digunakan' });
        }
        const newUser = new User({ username, password });
        await newUser.save();
        res.redirect('/login');
    } catch (err) {
        res.render('register', { error: 'Terjadi kesalahan saat registrasi' });
    }
});

// Tampilkan halaman login
// GET /login
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Proses data login
// POST /login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.render('login', { error: 'Username atau password salah' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', { error: 'Username atau password salah' });
        }
        req.session.userId = user._id;
        req.session.role = user.role;
        res.redirect('/dashboard');
    } catch (err) {
        res.render('login', { error: 'Terjadi kesalahan saat login' });
    }
});

// Proses logout
// GET /logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

module.exports = router;
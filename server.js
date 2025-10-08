// server.js (Dioptimalkan untuk Vercel)

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const { exec } = require('child_process'); // TIDAK DIGUNAKAN DI VERCEL
// const { exec } = require('child_process'); // TIDAK DIGUNAKAN DI VERCEL

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
// Vercel akan otomatis mengisi process.env.PORT
const PORT = process.env.PORT || 3000; 

// --- KONFIGURASI MONGODB (MENGGUNAKAN ATLAS/EKSTERNAL) ---

// AMBIL DARI ENVIRONMENT VARIABLE VERCEL
// Pastikan Anda telah mengatur MONGO_URI di Settings > Environment Variables Vercel
const MONGO_URI = process.env.MONGO_URI; 

if (!MONGO_URI) {
    console.error("❌ ERROR: Environment Variable MONGO_URI belum diatur. Koneksi ke database akan gagal.");
    // Hentikan eksekusi jika tidak ada URI, karena aplikasi tidak akan berfungsi
    // process.exit(1); 
}

// --- FUNGSI KONEKSI MONGODB ---

function connectToDatabase() {
    mongoose.connect(MONGO_URI)
        .then(() => {
            console.log('✅ Berhasil terhubung ke MongoDB Atlas (Eksternal)');
        })
        .catch(err => {
            console.error('❌ Koneksi MongoDB GAGAL:', err.message);
            console.error('Pastikan MONGO_URI di Vercel sudah benar dan IP Anda sudah diizinkan di MongoDB Atlas.');
        });
}


// --- INICIALISASI APLIKASI ---

// 1. Koneksi ke Database Eksternal
connectToDatabase(); 

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'ganti-ini-dengan-kunci-rahasia-dari-vercel', // Gunakan ENV Variable
    resave: false,
    saveUninitialized: false,
    // Gunakan MONGO_URI dari Atlas
    store: MongoStore.create({ mongoUrl: MONGO_URI }) 
}));

// Route Definitions
app.use('/', authRoutes);
app.use('/', dashboardRoutes);

app.get('/', (req, res) => {
    res.render('index'); 
});


// --- MULAI SERVER ---

// Vercel akan secara otomatis mendengarkan di port yang disediakan.
// Fungsi ini hanya dijalankan saat Vercel melakukan build/deploy.
app.listen(PORT, () => {
    console.log(`Server Node.js berjalan di port ${PORT}`);
    console.log(`Akses aplikasi di URL publik Vercel Anda.`);
});

// Tidak perlu penanganan SIGINT/Ctrl+C, Vercel menanganinya sendiri.

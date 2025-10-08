const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
// Modul ini hanya akan digunakan dalam mode lokal
const { exec } = require('child_process'); 
//const open = require('open'); 

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Tentukan apakah kita berada di Vercel (Production) atau Lokal (Development/Termux)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// MONGO_URI akan diambil dari Environment Variable di Vercel, 
// atau menggunakan URI lokal untuk Development/Termux.
const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/auth_project';
const MONGO_URI = IS_PRODUCTION ? process.env.MONGO_URI : LOCAL_MONGO_URI;

let mongodProcess = null;

// --- FUNGSI HANYA UNTUK LOKAL/TERMUX: MENJALANKAN MONGOD ---
function startMongoDBServer() {
    if (IS_PRODUCTION) {
        // Lewati jika di Vercel
        return;
    }
    
    // Logika mongod HANYA berjalan jika di lokal/Termux
    mongodProcess = exec('mongod --fork --logpath /dev/null', (error, stdout, stderr) => {
        if (error) {
            if (!stderr.includes('already in use') && !error.message.includes('code 48')) {
                console.error(`Gagal menjalankan mongod: ${stderr}`);
            }
        }
    });
    
    setTimeout(() => {
        mongoose.connect(MONGO_URI)
            .then(() => console.log('✅ Berhasil terhubung ke MongoDB LOKAL'))
            .catch(err => console.error('❌ Koneksi MongoDB lokal gagal:', err.message));
    }, 2000);
}

// --- FUNGSI HANYA UNTUK LOKAL/TERMUX: MENGHENTIKAN MONGOD ---
function stopMongodAndExit() {
    if (IS_PRODUCTION) {
        // Lewati jika di Vercel
        process.exit(0);
    }
    
    console.log('\n🛑 Menerima sinyal Ctrl+C. Menjalankan cleanup...');
    
    const killCommand = 'pkill mongod';
    
    exec(killCommand, (error, stdout, stderr) => {
        if (error && !stderr.includes('no process found')) {
            console.error(`❌ Gagal menjalankan pkill mongod: ${stderr.trim()}`);
        } else {
            console.log('✅ Semua proses mongod telah dihentikan.');
        }
        
        process.exit(0); 
    });
}

// --- FUNGSI HANYA UNTUK LOKAL/TERMUX: MENYIAPKAN AUTOSSH TUNNEL ---
function startAutoSshTunnel() {
    if (IS_PRODUCTION) {
        // Lewati jika di Vercel
        return;
    }
    
    const tunnelCommand = 'autossh -M 0 -R habib:80:localhost:3000 serveo.net';
    console.log(`\n tunneling ke serveo.net dengan: ${tunnelCommand}`);

    const tunnelProcess = exec(tunnelCommand);

    tunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        const urlMatch = output.match(/(https?:\/\/[a-zA-Z0-9-]+\.serveo\.net)/);
        
        if (urlMatch) {
            const tunnelUrl = urlMatch[1];
            console.log(`\n🎉 Tunnel Berhasil! Akses di: ${tunnelUrl}`);
            
            const openCommand = `xdg-open ${tunnelUrl} || termux-open-url ${tunnelUrl}`;
            
            exec(openCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`\n[Browser Gagal Dibuka] Coba buka URL ini secara manual: ${tunnelUrl}`);
                } else {
                    console.log('✅ URL otomatis dibuka di browser.');
                }
            });           
            
            tunnelProcess.stdout.removeAllListeners('data'); 
        } else {
             console.log(output.trim());
        }
    });

    tunnelProcess.stderr.on('data', (data) => {
        console.error(`[Tunnel Status] ${data.toString().trim()}`);
    });

    tunnelProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`\n❌ Autossh tunnel gagal dengan kode: ${code}. Pastikan 'autossh' dan 'ssh' terinstal.`);
        }
    });
    
    process.on('SIGINT', () => tunnelProcess.kill());
}

// --- FUNGSI KHUSUS VERCEL: KONEKSI KE ATLAS ---
function connectToAtlas() {
    if (!IS_PRODUCTION) {
        // Lewati jika di lokal/Termux
        return;
    }

    if (!MONGO_URI) {
        console.error("❌ ERROR: MONGO_URI belum diatur di Vercel Environment Variables.");
        return;
    }
    
    mongoose.connect(MONGO_URI)
        .then(() => {
            console.log('✅ Berhasil terhubung ke MongoDB Atlas (VERCEL)');
        })
        .catch(err => {
            console.error('❌ Koneksi MongoDB Atlas GAGAL:', err.message);
            console.error('Cek MONGO_URI di Vercel dan Network Access di Atlas.');
        });
}

// --- INICIALISASI APLIKASI ---

// Lakukan koneksi database sesuai mode
startMongoDBServer(); // Akan berjalan di lokal, dilewati di Vercel
connectToAtlas();     // Akan dilewati di lokal, berjalan di Vercel

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    // WAJIB menggunakan ENV Variable di Vercel (atau kunci lokal)
    secret: process.env.SESSION_SECRET || 'ini-adalah-kunci-rahasia-yang-sangat-panjang', 
    resave: false,
    saveUninitialized: false,
    // Gunakan MONGO_URI yang telah disesuaikan (lokal atau Atlas)
    store: MongoStore.create({ mongoUrl: MONGO_URI }) 
}));

app.use('/', authRoutes);
app.use('/', dashboardRoutes);

app.get('/', (req, res) => {
    res.render('index'); 
});

const server = app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT} [Mode: ${IS_PRODUCTION ? 'PRODUCTION/VERCEL' : 'DEVELOPMENT/LOKAL'}]`);
    
    // Mulai Tunnel HANYA jika di lokal/Termux
    startAutoSshTunnel(); 
});


// --- PENANGANAN SINYAL CTRL+C (SIGINT) ---
process.on('SIGINT', stopMongodAndExit); 

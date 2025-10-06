const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const { exec } = require('child_process');
//const open = require('open'); // MODUL BARU: Untuk membuka browser secara otomatis

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = 'mongodb://127.0.0.1:27017/auth_project';

let mongodProcess = null; // Tambahkan variabel untuk menyimpan proses mongod

// --- FUNGSI UTAMA: MENJALANKAN MONGOD ---
function startMongoDBServer() {
    // Jalankan mongod dan simpan prosesnya
    mongodProcess = exec('mongod --fork --logpath /dev/null', (error, stdout, stderr) => {
        if (error) {
            // Error code 48 biasanya berarti database sudah berjalan
            if (!stderr.includes('already in use') && !error.message.includes('code 48')) {
                console.error(`Gagal menjalankan mongod: ${stderr}`);
            }
        }
    });
    
    setTimeout(() => {
        mongoose.connect(MONGO_URI)
            .then(() => console.log('✅ Berhasil terhubung ke MongoDB'))
            .catch(err => console.error('❌ Koneksi MongoDB gagal:', err.message));
    }, 2000);
}

// --- FUNGSI BARU: MENGHENTIKAN MONGOD SECARA PAKSA ---
function stopMongodAndExit() {
    console.log('\n🛑 Menerima sinyal Ctrl+C. Menjalankan cleanup...');
    
    // Perintah untuk menghentikan semua proses mongod secara paksa
    const killCommand = 'pkill mongod';
    
    exec(killCommand, (error, stdout, stderr) => {
        if (error && !stderr.includes('no process found')) {
            console.error(`❌ Gagal menjalankan pkill mongod: ${stderr.trim()}`);
        } else {
            console.log('✅ Semua proses mongod telah dihentikan.');
        }
        
        // Hentikan server Node.js
        process.exit(0); 
    });
}

// --- FUNGSI BARU: MENYIAPKAN AUTOSSH TUNNEL ---
function startAutoSshTunnel() {
    const tunnelCommand = 'autossh -M 0 -R habib:80:localhost:3000 serveo.net';
    console.log(`\n tunneling ke serveo.net dengan: ${tunnelCommand}`);

    const tunnelProcess = exec(tunnelCommand);

    tunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        // Deteksi URL dari output Serveo (misalnya: "Forwarding to...")
        const urlMatch = output.match(/(https?:\/\/[a-zA-Z0-9-]+\.serveo\.net)/);
        
        if (urlMatch) {
            const tunnelUrl = urlMatch[1];
            console.log(`\n🎉 Tunnel Berhasil! Akses di: ${tunnelUrl}`);
            
            // Otomatis membuka URL di browser
             const openCommand = `xdg-open ${tunnelUrl} || termux-open-url ${tunnelUrl}`;
            
            exec(openCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`\n[Browser Gagal Dibuka] Coba buka URL ini secara manual: ${tunnelUrl}`);
                    // Biasanya gagal karena environment tidak memiliki xdg-open/termux-open
                } else {
                    console.log('✅ URL otomatis dibuka di browser.');
                }
            });           
           // open(tunnelUrl).catch(err => console.error('Gagal membuka browser:', err));
            
            // Penting: Hapus listener setelah URL ditemukan untuk mencegah logging berlebihan
            tunnelProcess.stdout.removeAllListeners('data'); 
        } else {
             // Tampilkan output Serveo lainnya
             console.log(output.trim());
        }
    });

    tunnelProcess.stderr.on('data', (data) => {
        // Serveo sering mengirimkan pesan status ke stderr
        console.error(`[Tunnel Status] ${data.toString().trim()}`);
    });

    tunnelProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`\n❌ Autossh tunnel gagal dengan kode: ${code}. Pastikan 'autossh' dan 'ssh' terinstal.`);
        }
    });
    
    // Pastikan tunnel juga dihentikan saat Ctrl+C
    process.on('SIGINT', () => tunnelProcess.kill());
}


// --- INICIALISASI APLIKASI ---

startMongoDBServer();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'ini-adalah-kunci-rahasia-yang-sangat-panjang',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI })
}));

app.use('/', authRoutes);
app.use('/', dashboardRoutes);

app.get('/', (req, res) => {
    res.render('index'); 
});

const server = app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
    
    // Mulai Tunnel setelah server utama berjalan
    startAutoSshTunnel(); 
});


// --- PENANGANAN SINYAL CTRL+C (SIGINT) ---
process.on('SIGINT', stopMongodAndExit); 

const express = require('express');
const User = require('../models/User');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer'); 
const AdmZip = require('adm-zip'); 
const tar = require('tar');      
const { exec, spawn } = require('child_process'); // <<< spawn DITAMBAHKAN!

// Tentukan root directory untuk upload, pastikan ini di luar code base jika memungkinkan
// ASUMSI: Setiap user memiliki folder unik di dalam ROOT_UPLOAD_DIR
const ROOT_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads'); 

if (!fs.existsSync(ROOT_UPLOAD_DIR)) {
    fs.mkdirSync(ROOT_UPLOAD_DIR, { recursive: true });
}

// Konfigurasi Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // PERBAIKAN: Gunakan fungsi resolvePath yang aman
        const targetPath = resolvePath(req.body.currentPath || ''); 
        cb(null, targetPath); 
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// --- MIDDLEWARE OTORISASI ---

function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    // PERBAIKAN: Selalu kembalikan 401 JSON untuk permintaan AJAX
    if (req.xhr || req.headers.accept.includes('json')) {
        return res.status(401).json({ message: 'Sesi kedaluwarsa. Silakan login ulang.' });
    }
    return res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session.role === 'admin') {
        return next();
    }
    if (req.xhr || req.headers.accept.includes('json')) {
        return res.status(403).json({ message: 'Akses ditolak: Anda bukan admin.' });
    }
    return res.status(403).send('Akses ditolak: Anda bukan admin.');
}

// --- FUNGSI BANTUAN PATH (KEAMANAN KRITIS) ---

function resolvePath(requestedPath) {
    const cleanPath = path.normalize(requestedPath || '');
    // Hapus titik-titik awal yang mungkin disalahgunakan, biarkan path relatif bersih
    const safePath = cleanPath.replace(/^(\.\.(\/|\\|$))+/, ''); 
    
    const fullPath = path.join(ROOT_UPLOAD_DIR, safePath);
    
    const resolvedUploadDir = path.resolve(ROOT_UPLOAD_DIR);
    const resolvedFullPath = path.resolve(fullPath); 
    
    // Validasi Path Traversal
    if (!resolvedFullPath.startsWith(resolvedUploadDir + path.sep) && resolvedFullPath !== resolvedUploadDir) {
        console.warn(`Path Traversal Attempt Detected: ${requestedPath}. Redirecting to root.`);
        return ROOT_UPLOAD_DIR; 
    }
    
    return fullPath; 
}

// --- FUNGSI BANTUAN ARCHIVE & EKSTRAKSI ---

function createZipArchive(itemsToArchive, currentDirectoryPath) {
    const zip = new AdmZip();
    let archiveName = `archive_${Date.now()}.zip`;
    const currentDirectoryFullPath = resolvePath(currentDirectoryPath); 
    const fullArchivePath = path.join(currentDirectoryFullPath, archiveName);

    itemsToArchive.forEach(relativePath => {
        const fullPath = resolvePath(relativePath);
        if (!fs.existsSync(fullPath)) return;
        
        const stats = fs.statSync(fullPath);
        const entryName = path.relative(currentDirectoryFullPath, fullPath); 

        if (stats.isDirectory()) {
            zip.addLocalFolder(fullPath, entryName);
        } else {
            zip.addLocalFile(fullPath, path.dirname(entryName));
        }
    });

    zip.writeZip(fullArchivePath);
    return itemsToArchive.length;
}


function extractSingleFile(filenameWithExt) {
    const filePath = resolvePath(filenameWithExt); 
    
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        throw new Error(`File arsip tidak ditemukan: ${filenameWithExt}`);
    }
    
    const currentDirectory = path.dirname(filePath);
    const filenameOnly = path.basename(filenameWithExt); 
    
    const extractTo = path.join(currentDirectory, filenameOnly.replace(/\.(zip|tar|tar\.gz|tgz)$/i, ''));

    if (!fs.existsSync(extractTo)) {
        fs.mkdirSync(extractTo, { recursive: true });
    }

    const filenameLower = filenameOnly.toLowerCase();
    
    if (filenameLower.endsWith('.zip')) {
        const zip = new AdmZip(filePath);
        zip.extractAllTo(extractTo, true); 
        return `ZIP: ${filenameOnly} berhasil diekstrak ke ${path.basename(extractTo)}.`;
        
    } else if (filenameLower.endsWith('.tar') || filenameLower.endsWith('.tar.gz') || filenameLower.endsWith('.tgz')) {
        tar.x({
            file: filePath,
            cwd: extractTo,
            sync: true, 
        });
        return `TAR/GZ: ${filenameOnly} berhasil diekstrak ke ${path.basename(extractTo)}.`;
        
    } else {
        throw new Error(`Format file ${path.extname(filenameOnly) || 'yang tidak diketahui'} tidak didukung untuk ekstraksi.`);
    }
}

// --- FUNGSI BANTUAN FILE LISTING ---

function getFilesList(currentPath) {
    const fullPath = resolvePath(currentPath);
    const relativePath = path.relative(ROOT_UPLOAD_DIR, fullPath); 
    
    try {
        const filesInDir = fs.readdirSync(fullPath);
        const fileList = [];
        
        if (relativePath !== '') {
            const parentRelativePath = path.relative(ROOT_UPLOAD_DIR, path.join(fullPath, '..'));
            fileList.push({
                name: '.. (Kembali)',
                size: '0 KB',
                isDirectory: true,
                path: parentRelativePath 
            });
        }
        
        filesInDir.forEach(name => {
            const filePath = path.join(fullPath, name);
            const stats = fs.statSync(filePath);
            const isDir = stats.isDirectory();
            const relativeFilePath = path.relative(ROOT_UPLOAD_DIR, filePath);
            
            fileList.push({
                name: name,
                size: isDir ? 'Folder' : (stats.size / 1024).toFixed(2) + ' KB',
                isDirectory: isDir,
                path: relativeFilePath 
            });
        });
        
        fileList.sort((a, b) => {
            if (a.name === '.. (Kembali)') return -1;
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        return { fileList, currentPath: relativePath };
        
    } catch (err) {
        console.error("Gagal membaca direktori:", fullPath, err);
        return { fileList: [], currentPath: '' };
    }
}

// ===================================
// --- ROUTE UTAMA DAN FILE MANAGEMENT ---
// ===================================

router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const allUsers = await User.find({}, 'username role');
        
        const requestedPath = req.query.path || ''; 
        
        const { fileList, currentPath } = getFilesList(requestedPath);
        
        if (!user) {
             return res.redirect('/logout');
        }

        const data = {
            user,
            users: allUsers,
            files: fileList,
            currentPath: currentPath 
        };

        if (user.role === 'admin') {
            res.render('dashboard_admin', data);
        } else {
            res.render('dashboard_user', data);
        }
    } catch (err) {
        console.error("Error di dashboard:", err);
        res.redirect('/login');
    }
});


router.post('/upload', isAuthenticated, upload.single('filedata'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('Tidak ada file yang diunggah.');
    }
    res.redirect('/dashboard?path=' + encodeURIComponent(req.body.currentPath || '')); 
});

router.get('/download/:filename', isAuthenticated, (req, res) => {
    const filePath = resolvePath(req.params.filename); 
    
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        const filenameOnly = path.basename(filePath);
        return res.download(filePath, filenameOnly);
    }
    res.status(404).send('File tidak ditemukan.');
});


// ROUTE: Ambil konten file untuk editor (USER & ADMIN)
router.get('/user/get-content/:filename', isAuthenticated, (req, res) => {
    const filePath = resolvePath(req.params.filename);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).json({ message: 'File atau direktori tidak ditemukan.' });
    }
    
    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) { 
         return res.status(413).json({ message: 'File terlalu besar (>10MB) untuk dilihat.' });
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Gagal membaca file:', err);
            return res.status(500).json({ message: 'Gagal membaca konten file.' });
        }
        
        res.set('Content-Type', 'text/plain');
        res.send(data); 
    });
});

// ROUTE: Simpan perubahan file dari editor (USER & ADMIN)
router.post('/user/edit/:filename', isAuthenticated, (req, res) => {
    const requestedPath = req.params.filename;
    const filePath = resolvePath(requestedPath);
    const newContent = req.body.fileContent;
    const currentPathForRedirect = req.body.currentPath; 

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).send('File tidak ditemukan.');
    }
    
    fs.writeFile(filePath, newContent, 'utf8', (err) => {
        if (err) {
            console.error('Gagal menyimpan file:', err);
            return res.status(500).send('Gagal menyimpan perubahan ke file.');
        }
        
        res.redirect('/dashboard?path=' + encodeURIComponent(currentPathForRedirect || '')); 
    });
});

// ROUTE: Ekstrak file tunggal (USER & ADMIN)
router.post('/extract/:filename', isAuthenticated, (req, res) => {
    const filenameWithExt = req.params.filename; 
    
    const parentPath = path.dirname(filenameWithExt); 
    const encodedParentPath = encodeURIComponent(parentPath);
    
    try {
        const result = extractSingleFile(filenameWithExt);
        console.log(`Ekstraksi berhasil: ${result}`); 

        res.redirect('/dashboard?path=' + encodedParentPath);

    } catch (error) {
        const errorMessage = `Gagal mengekstrak file ${filenameWithExt}: ${error.message}`;
        console.error(errorMessage);
        
        if (req.accepts('html')) {
            res.status(500).send(`
                <h1>Server Error 500: Ekstraksi Gagal</h1>
                <p><strong>Pesan:</strong> ${errorMessage}</p>
                <a href="/dashboard?path=${encodedParentPath}">Kembali ke Direktori Sebelumnya</a>
            `);
        } else {
             res.status(500).json({ 
                 message: 'Ekstraksi gagal.',
                 details: errorMessage
             });
        }
    }
});


// ===================================
// --- ROUTE SHELL (WEB SHELL) ---
// ===================================

/**
 * ROUTE BARU: Web Shell untuk User Biasa
 * Menggunakan EXEC (perintah harus selesai dalam waktu singkat).
 */
router.post('/user/execute-command', isAuthenticated, (req, res) => {
    const command = req.body.command;
    const currentPath = req.body.currentPath || '';
    const executionPath = resolvePath(currentPath);

    if (!command) {
        return res.status(400).json({ output: 'Perintah tidak boleh kosong.' }); 
    }
    
    // --- SERVER-SIDE COMMAND BLOCKING UNTUK USER BIASA (SANGAT KETAT) ---
    const strictDangerousCommands = [
        /\b(rm\s+-r|rm\s+-f|rm\s+-fr|rm\s+-rf|rm|pkill|kill\s+-9|shutdown|reboot|format|dd)\b/i, 
        /\b(useradd|usermod|passwd|etc\/passwd|etc\/shadow|chown)\b/i, 
        /\b(apt|pkg|yum|pacman|dpkg)\b/i, // Blokir package manager
        /\b(php\s+-S|node\s|python\s+-m\s+http\.server|npm\s+start|ssh|ssh\s+-R|autossh\s+-M\s+|autossh|npm\s+install)\b/i, // BLOKIR PERINTAH JANGKA PANJANG
    ];
    if (strictDangerousCommands.some(regex => regex.test(command))) {
        return res.status(403).json({ output: 'Perintah sistem yang dilarang terdeteksi oleh server.' });
    }
    // --- AKHIR BLOKING ---

    const options = {
        cwd: executionPath,
        timeout: 10000 
    };

    exec(command, options, (error, stdout, stderr) => {
        if (error) {
            console.error(`User Shell Error: ${error.message}`);
            return res.status(400).json({ output: `Error: ${error.message}` });
        }
        
        res.json({ output: (stdout || '') + (stderr || '') });
    });
});


/**
 * ROUTE: Web Shell untuk Admin
 * Menggunakan SPAWN dengan detached mode untuk perintah jangka panjang.
 */
router.post('/admin/execute-command', isAuthenticated, isAdmin, (req, res) => {
    const command = req.body.command.trim();
    const currentPath = req.body.currentPath || '';
    const executionPath = resolvePath(currentPath);

    if (!command) {
        return res.status(400).json({ output: 'Perintah tidak boleh kosong.' }); 
    }
    
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    // --- SERVER-SIDE COMMAND BLOCKING UNTUK ADMIN (HANYA YANG MERUSAK) ---
    const dangerousAdminCommands = [
        /\b(rm\s+-r|rm\s+-f|rm\s+-fr|rm\s+-rf|rm\s+-fr.*\/|rm\s+-rf.*\/|pkill|kill\s+-9|shutdown|reboot|format|dd)\b/i, 
        /\b(useradd|usermod|passwd|etc\/passwd|etc\/shadow)\b/i,
        // package manager & server diizinkan
    ];
    if (dangerousAdminCommands.some(regex => regex.test(command))) {
        return res.status(403).json({ output: 'Perintah sistem yang merusak dilarang.' });
    }
    // --- AKHIR BLOKING ---
    
    // === LOGIKA UNTUK MENANGANI PERINTAH JANGKA PANJANG (PHP -S, SSH, dll.) ===
    const longRunningCommands = ['php', 'node', 'python', 'npm', 'ssh', 'autossh'];
    const isServerCommand = command.includes('-S') || command.includes('start');

    if (longRunningCommands.includes(cmd) && (isServerCommand || cmd === 'ssh' || cmd === 'autossh')) {
        try {
            // Jalankan proses dalam mode 'detached'
            const child = spawn(cmd, args, {
                cwd: executionPath,
                detached: true, // WAJIB: TIDAK menunggu proses selesai
                stdio: 'ignore', // WAJIB: Abaikan I/O untuk mencegah hang
                shell: true      
            });

            child.unref(); // Lepaskan referensi

            const successMessage = `[INFO]: Perintah '${command}' berhasil dimulai di latar belakang (PID: ${child.pid}). Output TIDAK akan dikembalikan ke shell ini. Gunakan 'kill ${child.pid}' untuk menghentikannya.`;

            return res.json({ 
                output: successMessage,
                newPath: currentPath 
            });

        } catch (error) {
            console.error(`Error memulai proses latar belakang: ${error.message}`);
            return res.status(500).json({ output: `Gagal memulai proses latar belakang: ${error.message}` });
        }
    }
    // === AKHIR LOGIKA JANGKA PANJANG ===


    // === LOGIKA DEFAULT UNTUK PERINTAH JANGKA PENDEK (Admin) ===
    const options = {
        cwd: executionPath,
        timeout: 10000 // Waktu tunggu tetap 10 detik untuk perintah normal
    };

    exec(command, options, (error, stdout, stderr) => {
        if (error) {
            console.error(`Admin Shell Error: ${error.message}`);
            return res.status(400).json({ output: `Error: ${error.message}` });
        }
        
        res.json({ output: (stdout || '') + (stderr || '') });
    });
});


// ===================================
// --- ROUTE ADMIN ---
// ===================================

router.get('/admin/get-content/:filename', isAuthenticated, isAdmin, (req, res) => {
    const filePath = resolvePath(req.params.filename);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).json({ message: 'File atau direktori tidak ditemukan.' });
    }
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Gagal membaca konten file.' });
        }
        res.set('Content-Type', 'text/plain');
        res.send(data);
    });
});

router.post('/admin/edit/:filename', isAuthenticated, isAdmin, (req, res) => { 
    // Menggunakan route /user/edit yang lebih umum sudah cukup, tapi ini dipertahankan
    const requestedPath = req.params.filename;
    const filePath = resolvePath(requestedPath);
    const newContent = req.body.fileContent;
    const currentPathForRedirect = req.body.currentPath;

    fs.writeFile(filePath, newContent, 'utf8', (err) => {
        if (err) {
            return res.status(500).send('Gagal menyimpan perubahan ke file.');
        }
        res.redirect('/dashboard?path=' + encodeURIComponent(currentPathForRedirect || '')); 
    });
});

router.post('/admin/batch-archive', isAuthenticated, isAdmin, (req, res) => {
    let itemsToArchive = req.body.items; 
    const currentPath = req.body.currentPath || '';

    if (!itemsToArchive) {
        itemsToArchive = [];
    } else if (!Array.isArray(itemsToArchive)) {
        itemsToArchive = [itemsToArchive];
    }
    
    if (itemsToArchive.length === 0) {
        return res.redirect('/dashboard?path=' + encodeURIComponent(currentPath));
    }
    
    try {
        const count = createZipArchive(itemsToArchive, currentPath);
        console.log(`Berhasil mengarsipkan ${count} item`);
        res.redirect('/dashboard?path=' + encodeURIComponent(currentPath));
        
    } catch (error) {
        console.error('Gagal membuat archive ZIP:', error);
        res.status(500).send(`Gagal membuat archive ZIP: ${error.message}`);
    }
});


router.post('/admin/delete/:filename', isAuthenticated, isAdmin, (req, res) => {
    const filenameWithExt = req.params.filename;
    const filePath = resolvePath(filenameWithExt);
    
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const parentPath = path.dirname(filenameWithExt);

        if (stats.isDirectory()) {
            fs.rm(filePath, { recursive: true, force: true }, (err) => {
                if (err) {
                    console.error('Gagal menghapus direktori:', err);
                    return res.status(500).send('Gagal menghapus direktori di server.');
                }
                res.redirect('/dashboard?path=' + encodeURIComponent(parentPath));
            });
        } else {
            fs.unlink(filePath, (err) => { 
                if (err) {
                    console.error('Gagal menghapus file:', err);
                    return res.status(500).send('Gagal menghapus file di server.');
                }
                res.redirect('/dashboard?path=' + encodeURIComponent(parentPath));
            });
        }
    } else {
        res.redirect('/dashboard');
    }
});


router.post('/admin/batch-delete', isAuthenticated, isAdmin, async (req, res) => { 
    let itemsToDelete = req.body.items;
    const currentPath = req.body.currentPath || '';

    if (!itemsToDelete) {
        itemsToDelete = [];
    } else if (!Array.isArray(itemsToDelete)) {
        itemsToDelete = [itemsToDelete];
    }

    if (itemsToDelete.length === 0) {
        return res.redirect('/dashboard?path=' + encodeURIComponent(currentPath));
    }

    let promises = [];
    let failList = [];

    itemsToDelete.forEach(filenameWithExt => {
        const filePath = resolvePath(filenameWithExt);
        
        if (fs.existsSync(filePath)) {
             const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                promises.push(fs.promises.rm(filePath, { recursive: true, force: true }).catch(err => {
                    failList.push(`${filenameWithExt} (Dir Error: ${err.message})`);
                }));
            } else {
                promises.push(fs.promises.unlink(filePath).catch(err => {
                    failList.push(`${filenameWithExt} (File Error: ${err.message})`);
                }));
            }
        }
    });

    await Promise.all(promises);

    const message = failList.length > 0 
        ? `Berhasil menghapus ${itemsToDelete.length - failList.length} item. Gagal menghapus: ${failList.join(', ')}.`
        : `Berhasil menghapus ${itemsToDelete.length} item.`;

    console.log(`ADMIN BATCH DELETE: ${message}`);
    res.redirect('/dashboard?path=' + encodeURIComponent(currentPath));
});


router.post('/delete-user/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        if (req.params.id === req.session.userId.toString()) {
            return res.redirect('/dashboard');
        }
        await User.findByIdAndDelete(req.params.id);
        res.redirect('/dashboard');
    } catch (err) {
        console.error("Gagal menghapus user:", err);
        res.redirect('/dashboard');
    }
});
router.post('/admin/delete-all-users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const currentUserId = req.session.userId;
        
        const result = await User.deleteMany({ _id: { $ne: currentUserId } });
        
        console.log(`ADMIN ACTION: Berhasil menghapus ${result.deletedCount} user.`);
        
        res.status(200).json({ 
            message: `Berhasil menghapus ${result.deletedCount} user (tidak termasuk Anda).`,
            deletedCount: result.deletedCount
        });

    } catch (err) {
        console.error("Gagal menghapus semua user:", err);
        res.status(500).json({ message: 'Gagal menghapus semua user di server.' });
    }
});

// ===================================
// --- ROUTE BARU: ADMIN EXECUTION TOOL (Instalasi/Tooling) ---
// ===================================

/**
 * ROUTE: Eksekusi Perintah Tool Spesifik (HANYA ADMIN)
 * Rute ini dipertahankan, namun biasanya `/admin/execute-command` sudah cukup.
 * Menggunakan EXEC (perintah harus selesai dalam waktu singkat).
 */
router.post('/admin/execute-tool', isAuthenticated, isAdmin, (req, res) => {
    const command = req.body.command;
    const currentPath = req.body.currentPath || '';
    const executionPath = resolvePath(currentPath);

    if (!command) {
        return res.status(400).json({ output: 'Perintah tidak boleh kosong.' }); 
    }
    
    // --- SERVER-SIDE COMMAND BLOCKING TAMBAHAN ---
    const dangerousInstallCommands = [
        /\b(rm\s+-r|rm\s+-f|rm\s+-fr|rm\s+-rf|rm\s+-fr.*\/|rm\s+-rf.*\/|pkill|kill\s+-9|shutdown|reboot|format|dd)\b/i, 
        /\b(useradd|usermod|passwd|etc\/passwd|etc\/shadow)\b/i,
        /\b(apt|pkg|yum|pacman|dpkg|chown)\b/i, // Blokir package manager OS utama
    ];
    if (dangerousInstallCommands.some(regex => regex.test(command))) {
        return res.status(403).json({ output: 'Perintah instalasi/sistem yang sangat berbahaya dilarang.' });
    }
    // --- AKHIR BLOKING ---

    const options = {
        cwd: executionPath,
        timeout: 60000, 
        maxBuffer: 1024 * 1024 * 5 
    };

    console.log(`ADMIN TOOL EXEC: Executing "${command}" in ${executionPath}`);
    
    exec(command, options, (error, stdout, stderr) => {
        if (error) {
            console.error(`Tool Execution Error: ${error.message}`);
            return res.status(400).json({ output: `Error: ${error.message}\n${stderr}` });
        }
        
        res.json({ output: (stdout || '') + (stderr || '') });
    });
});

module.exports = router;

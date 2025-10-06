const express = require('express');
const User = require('../models/User');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer'); 
const AdmZip = require('adm-zip'); 
const tar = require('tar');      
const { exec } = require('child_process'); 

// Tentukan root directory untuk upload, pastikan ini di luar code base jika memungkinkan
const ROOT_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads'); 

if (!fs.existsSync(ROOT_UPLOAD_DIR)) {
    fs.mkdirSync(ROOT_UPLOAD_DIR, { recursive: true });
}

// Konfigurasi Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // PERBAIKAN: Jika Anda mengirim currentPath dari form, gunakan fungsi aman untuk menentukan destinasi
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
    if (req.accepts('html')) {
        return res.redirect('/login');
    }
    return res.status(401).json({ message: 'Unauthorized' });
}

function isAdmin(req, res, next) {
    if (req.session.role === 'admin') {
        return next();
    }
    if (req.accepts('html')) {
        return res.status(403).send('Akses ditolak: Anda bukan admin.');
    }
    return res.status(403).json({ message: 'Akses ditolak: Anda bukan admin.' });
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
    // Jika fullPath yang sudah di-resolve TIDAK dimulai dengan resolvedUploadDir, 
    // berarti path tersebut keluar dari direktori yang diizinkan.
    if (!resolvedFullPath.startsWith(resolvedUploadDir + path.sep) && resolvedFullPath !== resolvedUploadDir) {
        console.warn(`Path Traversal Attempt Detected: ${requestedPath}. Redirecting to root.`);
        return ROOT_UPLOAD_DIR; 
    }
    
    // Kembalikan full path yang telah diverifikasi keamanannya
    return fullPath; 
}

// --- FUNGSI BANTUAN ARCHIVE & EKSTRAKSI ---

function createZipArchive(itemsToArchive, currentDirectoryPath) {
    // ... (Logika createZipArchive tetap sama) ...
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
            // Pastikan entri direktori di zip diberi nama relatif
            zip.addLocalFolder(fullPath, entryName);
        } else {
            // path.dirname(entryName) memberikan direktori di dalam ZIP
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

// --- FUNGSI BANTUAN FILE LISTING (Tidak diubah, sudah benar) ---

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
// --- ROUTE UTAMA DAN USER ---
// ===================================

router.get('/dashboard', isAuthenticated, async (req, res) => {
    // ... (Logika dashboard tetap sama) ...
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
    // Menggunakan currentPath dari hidden input di form
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

// ROUTE BARU: Simpan perubahan file dari editor (USER & ADMIN)
router.post('/user/edit/:filename', isAuthenticated, (req, res) => {
    const requestedPath = req.params.filename;
    const filePath = resolvePath(requestedPath);
    const newContent = req.body.fileContent;
    const currentPathForRedirect = req.body.currentPath; // Ambil dari hidden input

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return res.status(404).send('File tidak ditemukan.');
    }
    
    fs.writeFile(filePath, newContent, 'utf8', (err) => {
        if (err) {
            console.error('Gagal menyimpan file:', err);
            return res.status(500).send('Gagal menyimpan perubahan ke file.');
        }
        
        // Redirect kembali ke direktori saat ini, bukan direktori induk
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
                <p>Periksa konsol server untuk detail seperti "Invalid CEN header" (biasanya berarti file rusak).</p>
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
// --- ROUTE ADMIN (TIDAK ADA PERUBAHAN BESAR) ---
// ===================================

// ROUTE: Ambil konten file untuk editor (Admin Only - Redundant, tapi dipertahankan)
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

// ROUTE: Simpan perubahan file dari editor (Admin Only - Redundant, tapi dipertahankan)
router.post('/admin/edit/:filename', isAuthenticated, isAdmin, (req, res) => { 
    // Menggunakan route /user/edit yang lebih umum sudah cukup, tapi ini dipertahankan
    const requestedPath = req.params.filename;
    const filePath = resolvePath(requestedPath);
    const newContent = req.body.fileContent;
    const parentPath = path.dirname(requestedPath);
    
    fs.writeFile(filePath, newContent, 'utf8', (err) => {
        if (err) {
            return res.status(500).send('Gagal menyimpan perubahan ke file.');
        }
        res.redirect('/dashboard?path=' + encodeURIComponent(parentPath)); 
    });
});


// ROUTE: EKSEKUSI PERINTAH SHELL (Sekarang hanya butuh isAuthenticated)
// PERHATIAN: Pastikan logika resolvePath DAN pencegahan perintah berbahaya di sini SANGAT KUAT!
router.post('/admin/execute-command', isAuthenticated, (req, res) => {
    const command = req.body.command;
    const currentPath = req.body.currentPath || '';
    const executionPath = resolvePath(currentPath); // Path harus aman

    if (!command) {
        return res.status(400).json({ output: 'Perintah tidak boleh kosong.' }); 
    }
    
    // --- SERVER-SIDE COMMAND BLOCKING (Lapisan Keamanan Krusial) ---
    const dangerousCommands = [
        /\b(rm\s+-r|rm\s+-f|rm|cp|cp\s+-r|pkill|kill\s+-9|shutdown|reboot|format|dd)\b/i, 
        /\b(useradd|usermod|passwd|etc\/passwd|etc\/shadow)\b/i
    ];
    if (dangerousCommands.some(regex => regex.test(command))) {
        // Response 403 karena perintah berbahaya
        return res.status(403).json({ output: 'Perintah sistem yang dilarang terdeteksi oleh server.' });
    }
    // --- AKHIR BLOKING ---

    const options = {
        cwd: executionPath,
        timeout: 10000 
    };

    exec(command, options, (error, stdout, stderr) => {
        if (error) {
            console.error(`Shell Error: ${error.message}`);
            return res.status(400).json({ output: `Error: ${error.message}` });
        }
        
        res.json({ output: (stdout || '') + (stderr || '') });
    });
});


// ... (ROUTE ADMIN lainnya: batch-archive, delete, batch-delete, delete-user) ...

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


module.exports = router;

// File: change_role.js (Contoh Script)
const mongoose = require('mongoose');
const User = require('./models/User'); // Pastikan path ini benar

const MONGO_URI = 'mongodb://127.0.0.1:27017/auth_project';

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Terhubung ke MongoDB. Mencoba mengubah role...');

        const result = await User.updateOne(
            { username: "habibGM" },
            { role: "admin" }
        );

        if (result.modifiedCount === 1) {
            console.log("✅ Sukses! Role 'habibGM' telah diubah menjadi 'admin'.");
        } else if (result.matchedCount === 1 && result.modifiedCount === 0) {
            console.log("ℹ️ Pengguna ditemukan, tetapi rolenya sudah 'admin'. Tidak ada perubahan dilakukan.");
        } else {
            console.log("❌ Gagal. Pengguna 'habibGM' tidak ditemukan.");
        }

        mongoose.connection.close();
    })
    .catch(err => {
        console.error('Koneksi MongoDB gagal:', err);
    });

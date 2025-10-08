#!/bin/bash

# start_php_server.sh
# Skrip ini digunakan untuk memulai PHP Built-in Server dan opsional SSH Tunneling menggunakan autossh.
# Dirancang untuk dipanggil di lingkungan server.

# Variabel yang diperlukan
PORT=$1
FOLDER=$2
TUNNEL_HOST=$3 # Opsional: contoh serveo.net

# Validasi input
if [ -z "$PORT" ] || [ -z "$FOLDER" ]; then
    echo "Penggunaan: $0 <port> <folder_path> [tunnel_host]"
    echo "Contoh: $0 8080 /var/www/html serveo.net"
    exit 1
fi

# 1. Jalankan PHP Built-in Server menggunakan PM2
PHP_PROCESS_NAME="php-server-$PORT"
echo "-> Memulai PHP Server $PHP_PROCESS_NAME di port $PORT dari folder: $FOLDER"

# Perintah PM2: menjalankan php -S 0.0.0.0:<port>
# -c: change directory (pindah ke folder sebelum menjalankan)
pm2 start --name "$PHP_PROCESS_NAME" --interpreter "php" -- -S 0.0.0.0:"$PORT"
# Tambahkan --cwd "$FOLDER" jika PM2 Anda mendukungnya, atau pastikan script ini dijalankan dari root direktori yang benar.

if [ $? -ne 0 ]; then
    echo "ERROR: Gagal memulai PHP Server dengan PM2. Pastikan 'php' dan 'pm2' sudah terinstal."
    exit 1
fi

# 2. Opsional: Jalankan SSH Tunneling menggunakan autossh
if [ -n "$TUNNEL_HOST" ]; then
    TUNNEL_PROCESS_NAME="tunnel-$PORT-$TUNNEL_HOST"
    echo "-> Memulai SSH Tunneling $TUNNEL_PROCESS_NAME ke $TUNNEL_HOST:$PORT"

    # Perintah autossh: Membuat remote port forward (-R)
    # -M 0: Nonaktifkan port monitor
    # -o "StrictHostKeyChecking=no": Jangan meminta konfirmasi host
    # -R <remote-port>:<local-host>:<local-port>
    SSH_COMMAND="autossh -M 0 -o \"StrictHostKeyChecking=no\" -o \"UserKnownHostsFile=/dev/null\" -R $PORT:localhost:$PORT $TUNNEL_HOST"

    # Jalankan perintah SSH di background menggunakan PM2
    # Kita menggunakan bash -c untuk mengeksekusi string perintah
    pm2 start --name "$TUNNEL_PROCESS_NAME" --interpreter "bash" -- -c "$SSH_COMMAND"

    if [ $? -eq 0 ]; then
        echo "Server dan Tunneling berhasil dimulai."
        echo "Akses lokal: http://localhost:$PORT"
        echo "Akses publik: Cek log PM2 untuk tautan SSH Tunnel ($TUNNEL_PROCESS_NAME)."
    else
        echo "PERINGATAN: Gagal memulai SSH Tunneling. Pastikan 'autossh' terinstal."
    fi
else
    echo "Server PHP berhasil dimulai di http://localhost:$PORT (tanpa tunneling)."
fi

exit 0
<?php
session_start();
if (!isset($_SESSION['gm_logged1991'])) {
    header("Location: habibGM.php");
    exit();
}
// Log out
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: ' . basename($_SERVER['PHP_SELF']));
    exit;
}
// Skrip koneksi Anda
    $servername = "sql209.my-php.net";
    $username = "my_39973345";
    $password = "H@8!8321";
    $port = "3306";
    
    // Langsung tentukan database yang dapat diakses oleh pengguna
    $database = "my_39973345";
// --- PENTING: LOGIKA EKSPOR DIJALANKAN DI SINI ---
// Pastikan tidak ada karakter lain sebelum tag <?php di baris ini
if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['export'])) {
    @$conn = new mysqli($servername, $username, $password, $database);
    if ($conn->connect_error) {
        die("Koneksi gagal: " . $conn->connect_error);
    }

    // Ambil semua nama tabel
    $tables = [];
    $result = $conn->query("SHOW TABLES");
    while ($row = $result->fetch_row()) {
        $tables[] = $row[0];
    }

    // Mulai membangun string SQL
    $return = "-- Database Backup\n";
    $return .= "-- Generated on: " . date('Y-m-d H:i:s') . "\n";
    $return .= "-- Database: `$database`\n";
    $return .= "-- ------------------------------------------------------\n\n";

    $return .= "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n";
    $return .= "START TRANSACTION;\n";
    $return .= "SET time_zone = \"+00:00\";\n";
    $return .= "SET NAMES utf8mb4;\n\n";

    // Bagian 1: Loop untuk STRUKTUR TABEL
    foreach ($tables as $table) {
        $row2 = $conn->query("SHOW CREATE TABLE `$table`")->fetch_row();
        $return .= "\n--\n-- Table structure for table `$table`\n--\n\n";
        $return .= $row2[1] . ";\n\n";
    }

    // Bagian 2: Loop untuk DATA TABEL
    foreach ($tables as $table) {
        $result = $conn->query("SELECT * FROM `$table`");
        $num_fields = $result->field_count;
        $num_rows = $result->num_rows;

        if ($num_rows > 0) {
            $return .= "--\n-- Dumping data for table `$table`\n--\n\n";

            // Ambil nama kolom
            $fields_info = $result->fetch_fields();
            $field_names = array_map(function($field) {
                return '`' . $field->name . '`';
            }, $fields_info);
            
            $insert_header = "INSERT INTO `$table` (" . implode(', ', $field_names) . ") VALUES\n";
            $return .= $insert_header;

            $row_count = 0;
            while ($row = $result->fetch_row()) {
                $row_count++;
                $return .= "(";
                for ($j = 0; $j < $num_fields; $j++) {
                    if (isset($row[$j])) {
                        // Escape data dengan benar
                        $row[$j] = $conn->real_escape_string($row[$j]);
                        $return .= '"' . $row[$j] . '"';
                    } else {
                        $return .= 'NULL'; // Gunakan NULL untuk nilai kosong
                    }
                    if ($j < ($num_fields - 1)) {
                        $return .= ',';
                    }
                }
                // Tambahkan koma untuk baris berikutnya atau titik koma di akhir
                $return .= ($row_count < $num_rows) ? "),\n" : ");\n";
            }
             $return .= "\n";
        }
    }
    
    // Bagian 3: Tambahkan Primary Keys, Indexes, dan Auto Increment
    // (Catatan: SHOW CREATE TABLE sudah mencakup ini, namun untuk format yang
    // mirip phpMyAdmin, ALTER TABLE akan ditambahkan di sini. Untuk simplisitas,
    // kode ini akan mengandalkan definisi dari SHOW CREATE TABLE yang sudah lengkap)

    $return .= "\nCOMMIT;\n";
    
    $conn->close();
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . $database . '_backup_' . date('Y-m-d-H-i-s') . '.sql"');
    echo $return;
    exit; // Berhenti total
}

// Lanjutkan sisa skrip untuk menampilkan HTML
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Manager Pro</title>
	<link rel="icon" href="/favicon.ico" type="image/x-icon">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
    
    <style>
        /* Gaya Glassmorphism dan Responsif */
        body {
            background-image: url('https://cdn.dribbble.com/userupload/27435641/file/original-87e3cd7b0f8a9157fe2b2f10421253cb.gif'); 
            background-size: cover; 
            background-repeat: no-repeat;
            background-attachment: fixed;
            background-position: center;
            color: #ffffff;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }
        
        .container {
            max-width: auto; /* Lebar maksimal untuk tampilan menengah */
            margin-left: auto;
            margin-right: auto;
        }

        .glass-card {
            background: rgba(10, 10, 25, 0.4);
            backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            color: whitesmoke;
        }

        .card-header, .table {
            background-color: rgba(255, 255, 255, 0.1) !important;
        }
        
        .table {
            border: 1px solid rgba(255, 255, 255, 0.18);
            word-break: break-word;
            overflow-wrap: break-word;
            padding: 8px;
            overflow: scroll;
        }

        .table th, .table td {
            border-color: rgba(255, 255, 255, 0.2);
            vertical-align: middle;
        }

        h4, h5, .alert, a {
            color: #333 !important;
            text-decoration: none;
        }
        a:hover {
            color: #0dcaf0 !important;
            text-decoration: none;
        }

        .btn {
            border-radius: 0.5rem;
            transition: all 0.3s ease;
        }
        
        .form-control {
            background-color: rgba(0, 0, 0, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .form-control:focus {
            background-color: rgba(0, 0, 0, 0.3);
            color: white;
            border-color: #0dcaf0;
            box-shadow: 0 0 0 0.25rem rgba(13, 202, 240, 0.25);
        }
        .form-control::placeholder {
            color: rgba(255, 255, 255, 0.5);
        }

        /* Gaya Kustom untuk Modal */
        .modal-content.glass-card {
            background: rgba(15, 15, 30, 0.8);
        }
        .modal-header, .modal-footer {
            border-color: rgba(255, 255, 255, 0.2);
        }
		.gelas {
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            color: whitesmoke;
            transition: transform 0.2s, box-shadow 0.2s;
        }
    </style>
</head>
<body>

<div class="container mt-5 mb-5">
	<h1 class="text-center mb-0 text-light">Database Manager</h1>
    <div class="d-flex justify-content-between align-items-center mb-4 overflow-scroll mt-4">
		<button onclick='location.href="<?php echo basename($_SERVER['PHP_SELF']); ?>"' class="btn btn-secondary gelas me-2">home</button>
		<button onclick='location.href="habibGM.php"' class="btn btn-secondary gelas me-2">File Manager</button>
        <button onclick='location.href="?logout=1"' class="btn btn-secondary gelas me-2">Logout</button>
    </div>

    <?php
    @$conn = new mysqli($servername, $username, $password, $database);

    if ($conn->connect_error) {
        echo '<div class="alert alert-danger" role="alert">';
        echo "Koneksi gagal: " . $conn->connect_error;
        echo '</div>';
    } else {
        echo '<div class="alert alert-success" role="alert">';
        echo "Koneksi berhasil ke server MySQL";
        echo '</div>';
        
        // --- Logika untuk Membuat Database (Dinonaktifkan) ---
?>
        <div class="alert alert-warning" role="alert">
                <h4 class="alert-heading">Fitur "Buat Database" Dinonaktifkan</h4>
                <p>Pengguna hosting web biasanya tidak memiliki izin untuk membuat database baru. Anda hanya bisa mengelola database yang sudah ada.</p>
              </div>
 <?php       
        // --- Logika untuk Menjalankan SQL Kustom ---
        if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['execute_sql'])) {
            $sql_query = $_POST['sql_query'];
            if (!empty($sql_query)) {
                if ($conn->multi_query($sql_query)) {
                    echo '<div class="alert alert-success" role="alert">Query berhasil dieksekusi.</div>';
                    do {
                        if ($result = $conn->store_result()) {
                            echo '<div class="card my-3 glass-card">';
                            echo '<div class="card-header">Hasil Query</div>';
                            echo '<div class="card-body">';
                            echo '<div class="table-responsive">';
                            echo '<table class="table overflow-scroll">';
                            echo '<thead><tr class="text-nowrap">';
                            while ($fieldinfo = $result->fetch_field()) {
                                echo '<th>' . htmlspecialchars($fieldinfo->name) . '</th>';
                            }
                            echo '</tr></thead>';
                            echo '<tbody>';
                            while ($row = $result->fetch_assoc()) {
                                echo '<tr class="text-nowrap">';
                                foreach ($row as $value) {
                                    echo '<td class="text-nowrap">' . htmlspecialchars($value) . '</td>';
                                }
                                echo '</tr>';
                            }
                            echo '</tbody>';
                            echo '</table>';
                            echo '</div>'; // table-responsive
                            echo '</div>'; // card-body
                            echo '</div>'; // card
                            $result->free();
                        }
                    } while ($conn->next_result());
                } else {
                    echo '<div class="alert alert-danger" role="alert">Error saat menjalankan query: ' . $conn->error . '</div>';
                }
            }
        }
        
        // --- Logika untuk Memperbarui Baris Data (Fungsi Edit) ---
        if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['update_row'])) {
            $tableName = $_POST['table_name'];
            $pkName = $_POST['pk_name'];
            $pkValue = $_POST['pk_value'];
            
            $setClauses = [];
            foreach ($_POST['columns'] as $colName => $colValue) {
                $colName = '`' . str_replace('`', '', $colName) . '`';
                $setClauses[] = "$colName = ?";
            }
            
            $sql_update = "UPDATE `$tableName` SET " . implode(', ', $setClauses) . " WHERE `$pkName` = ?";
            $stmt = $conn->prepare($sql_update);
            
            if ($stmt) {
                $types = str_repeat('s', count($_POST['columns'])) . 's';
                $values = array_values($_POST['columns']);
                $values[] = $pkValue;
                
                $stmt->bind_param($types, ...$values);
                
                if ($stmt->execute()) {
                    echo '<div class="alert alert-success">Baris berhasil diperbarui. <a href="?db='.urlencode($database).'&view_table='.urlencode($tableName).'"> ✓Kembali ke tabel</a>.</div>';
                } else {
                    echo '<div class="alert alert-danger">Error saat memperbarui baris: ' . $stmt->error . '</div>';
                }
                $stmt->close();
            } else {
                echo '<div class="alert alert-danger">Error preparing statement: ' . $conn->error . '</div>';
            }
        }

        // --- Logika untuk Menambah Tabel ---
        if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['create_table'])) {
            $tableName = $_POST['table_name'];
            $columns = $_POST['columns'];

            if (!empty($tableName) && !empty($columns)) {
                $sql_create = "CREATE TABLE `$tableName` ($columns)";
                if ($conn->query($sql_create) === TRUE) {
                    echo '<div class="alert alert-success" role="alert">Tabel "' . htmlspecialchars($tableName) . '" berhasil dibuat.</div>';
                } else {
                    echo '<div class="alert alert-danger" role="alert">Error saat membuat tabel: ' . $conn->error . '</div>';
                }
            } else {
                echo '<div class="alert alert-warning" role="alert">Nama tabel dan kolom tidak boleh kosong.</div>';
            }
        }
        
        // --- Logika untuk Menghapus Tabel ---
        if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['delete_table'])) {
            $tableName = $_POST['table_name_to_delete'];
            $sql_delete = "DROP TABLE `$tableName`";
            if ($conn->query($sql_delete) === TRUE) {
                echo '<div class="alert alert-success" role="alert">Tabel "' . htmlspecialchars($tableName) . '" berhasil dihapus.</div>';
            } else {
                echo '<div class="alert alert-danger" role="alert">Error saat menghapus tabel: ' . $conn->error . '</div>';
            }
        }
        
        // --- Logika untuk Impor/Ekspor (ditambahkan kembali) ---
        if ($_SERVER['REQUEST_METHOD'] == 'POST' && isset($_POST['import'])) {
            if (isset($_FILES['sql_file']) && $_FILES['sql_file']['error'] == 0) {
                $sql_file_path = $_FILES['sql_file']['tmp_name'];
                $sql_content = file_get_contents($sql_file_path);
                if ($conn->multi_query($sql_content) === TRUE) {
                    echo '<div class="alert alert-success" role="alert">File SQL berhasil diimpor ke database "' . htmlspecialchars($database) . '".</div>';
                } else {
                    echo '<div class="alert alert-danger" role="alert">Error saat mengimpor file SQL: ' . $conn->error . '</div>';
                }
            } else {
                echo '<div class="alert alert-warning" role="alert">Pilih file SQL untuk diimpor.</div>';
            }
        }
    ?>

    <div class="alert alert-info" role="alert">
        Anda sedang mengelola database: <strong><?php echo htmlspecialchars($database); ?></strong>
    </div>

    <?php
        // --- TAMPILAN 1: FORMULIR EDIT BARIS ---
        if (isset($_GET['edit_row'])) {
            $tableName = $_GET['table'];
            $pkName = $_GET['pk_name'];
            $pkValue = $_GET['pk_value'];

            $sql_select_row = "SELECT * FROM `$tableName` WHERE `$pkName` = ?";
            $stmt = $conn->prepare($sql_select_row);
            $stmt->bind_param('s', $pkValue);
            $stmt->execute();
            $resultRow = $stmt->get_result();
            $row_to_edit = $resultRow->fetch_assoc();
            $stmt->close();

            if ($row_to_edit) {
                echo '<div class="card mb-4 glass-card">';
                echo '<div class="card-header"><h2>Edit Baris di Tabel: ' . htmlspecialchars($tableName) . '</h2></div>';
                echo '<div class="card-body">';
                echo '<form method="POST">';
                echo '<input type="hidden" name="update_row" value="1">';
                echo '<input type="hidden" name="table_name" value="' . htmlspecialchars($tableName) . '">';
                echo '<input type="hidden" name="pk_name" value="' . htmlspecialchars($pkName) . '">';
                echo '<input type="hidden" name="pk_value" value="' . htmlspecialchars($pkValue) . '">';

                foreach ($row_to_edit as $column => $value) {
                    echo '<div class="mb-3">';
                    echo '<label for="col_' . htmlspecialchars($column) . '" class="form-label">' . htmlspecialchars($column) . '</label>';
                    $isReadOnly = ($column == $pkName) ? 'readonly' : '';
                    $inputName = ($column == $pkName) ? '' : 'name="columns[' . htmlspecialchars($column) . ']"';

                    if (strlen((string)$value) > 100) { // Gunakan textarea untuk data panjang
                        echo '<textarea class="form-control" id="col_' . htmlspecialchars($column) . '" ' . $inputName . ' rows="5" ' . $isReadOnly . '>' . htmlspecialchars($value) . '</textarea>';
                    } else {
                        echo '<input type="text" class="form-control" id="col_' . htmlspecialchars($column) . '" ' . $inputName . ' value="' . htmlspecialchars($value) . '" ' . $isReadOnly . '>';
                    }
                    echo '</div>';
                }
                echo '<button type="submit" class="btn btn-success">Simpan Perubahan</button>';
                echo ' <a href="?db=' . urlencode($database) . '&view_table=' . urlencode($tableName) . '" class="btn btn-secondary">Batal</a>';
                echo '</form>';
                echo '</div></div>';
            } else {
                echo '<div class="alert alert-danger">Baris tidak ditemukan.</div>';
            }

        // --- TAMPILAN 2: MENAMPILKAN DATA TABEL ---
        } elseif (isset($_GET['view_table'])) {
            $tableName = $_GET['view_table'];
            
            // Cari Primary Key untuk fungsionalitas Edit
            $pkQuery = "SHOW KEYS FROM `$tableName` WHERE Key_name = 'PRIMARY'";
            $pkResult = $conn->query($pkQuery);
            $primaryKey = ($pkRow = $pkResult->fetch_assoc()) ? $pkRow['Column_name'] : null;

            $sql_select = "SELECT * FROM `$tableName`";
            $result_data = $conn->query($sql_select);

            echo '<div class="card mb-4 glass-card">';
            echo '<div class="card-header"><h2>Data Tabel: ' . htmlspecialchars($tableName) . '</h2></div>';
            echo '<div class="card-body">';
            echo '<a href="?db=' . urlencode($database) . '" class="btn btn-secondary btn-sm mb-3">← Kembali ke Daftar Tabel</a>';

            if ($result_data && $result_data->num_rows > 0) {
                echo '<div class="table-responsive">';
                echo '<table class="table overflow-scroll">';
                echo '<thead><tr class="text-nowrap">';
                while ($fieldinfo = $result_data->fetch_field()) {
                    echo '<th class="text-nowrap">' . htmlspecialchars($fieldinfo->name) . '</th>';
                }
                if ($primaryKey) echo '<th class="text-nowrap">Aksi</th>'; // Tambah header Aksi jika ada PK
                echo '</tr></thead>';
                echo '<tbody>';
                while($row = $result_data->fetch_assoc()) {
                    echo '<tr class="text-nowrap">';
                    foreach($row as $value) {
                        echo '<td class="text-nowrap">' . htmlspecialchars($value) . '</td>';
                    }
                    if ($primaryKey) {
                        $pkValue = $row[$primaryKey];
                        echo '<td class="text-center">';
                        echo '<a href="?db=' . urlencode($database) . '&edit_row=true&table=' . urlencode($tableName) . '&pk_name=' . urlencode($primaryKey) . '&pk_value=' . urlencode($pkValue) . '" class="btn btn-warning btn-sm">Edit</a>';
                        echo '</td>';
                    }
                    echo '</tr>';
                }
                echo '</tbody>';
                echo '</table>';
                echo '</div>'; // table-responsive
            } else {
                echo '<div class="alert alert-info" role="alert">Tabel ini tidak memiliki data.</div>';
            }
            echo '</div></div>';
            
        // --- TAMPILAN 3: HALAMAN UTAMA (DAFTAR TABEL & FORM) ---
        } else {
    ?>
    <div class="row">
        <div class="col-lg-6 mb-4">
             <div class="card mb-4 glass-card h-100">
                <div class="card-header">Jalankan Perintah SQL</div>
                <div class="card-body">
                    <form method="POST">
                        <input type="hidden" name="db" value="<?php echo htmlspecialchars($database); ?>">
                        <div class="mb-3">
                            <textarea class="form-control" id="sql_query" name="sql_query" rows="5" placeholder="Masukkan perintah SQL Anda (misal: SELECT * FROM users;)" required></textarea>
                        </div>
                        <button type="submit" name="execute_sql" class="btn btn-info text-white">Jalankan SQL</button>
                    </form>
                </div>
            </div>
        </div>
        <div class="col-lg-6 mb-4">
            <div class="card glass-card h-100">
                <div class="card-header">Buat Tabel Baru</div>
                <div class="card-body">
                    <form method="POST">
                        <input type="hidden" name="db" value="<?php echo htmlspecialchars($database); ?>">
                        <div class="mb-3">
                            <label for="table_name" class="form-label">Nama Tabel</label>
                            <input type="text" class="form-control" id="table_name" name="table_name" required>
                        </div>
                        <div class="mb-3">
                            <label for="columns" class="form-label">Definisi Kolom</label>
                            <textarea class="form-control" id="columns" name="columns" rows="3" placeholder="Contoh: id INT PRIMARY KEY, nama VARCHAR(255)" required></textarea>
                        </div>
                        <button type="submit" name="create_table" class="btn btn-primary">Buat Tabel</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    
    <div class="row">
        <div class="col-lg-6 mb-4">
            <div class="card glass-card h-100">
                <div class="card-header">Ekspor Database</div>
                <div class="card-body">
                    <form method="POST">
                        <input type="hidden" name="db" value="<?php echo htmlspecialchars($database); ?>">
                        <button type="submit" name="export" class="btn btn-primary">Ekspor ke File SQL</button>
                    </form>
                </div>
            </div>
        </div>
        <div class="col-lg-6 mb-4">
            <div class="card glass-card h-100">
                <div class="card-header">Impor Database</div>
                <div class="card-body">
                    <form method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="db" value="<?php echo htmlspecialchars($database); ?>">
                        <div class="mb-3">
                            <label for="sql_file" class="form-label">Pilih File SQL</label>
                            <input type="file" class="form-control" id="sql_file" name="sql_file" required>
                        </div>
                        <button type="submit" name="import" class="btn btn-primary">Impor</button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <?php
            // --- Skrip untuk menampilkan semua tabel dalam format tabel HTML responsif ---
            $sql = "SHOW TABLES";
            $result = $conn->query($sql);

            if ($result->num_rows > 0) {
                echo '<div class="card glass-card">';
                echo '<div class="card-header">';
                echo '<h3>Daftar Tabel di ' . htmlspecialchars($database) . '</h3>';
                echo '</div>';
                echo '<div class="card-body">';
                echo '<div class="table-responsive">';
                echo '<table class="table overflow-scroll">';
                echo '<thead><tr class="text-nowrap"><th>Nama Tabel</th><th class="text-end">Aksi</th></tr></thead>';
                echo '<tbody>';
                while($row = $result->fetch_array()) {
                    $tableName = $row[0];
                    echo '<tr>';
                    echo '<td><a href="?db=' . urlencode($database) . '&view_table=' . urlencode($tableName) . '">' . htmlspecialchars($tableName) . '</a></td>';
                    echo '<td class="text-end">';
                    echo '<form method="POST" onsubmit="return confirm(\'Anda yakin ingin menghapus tabel ' . htmlspecialchars($tableName) . '?\');" class="d-inline">';
                    echo '<input type="hidden" name="db" value="' . htmlspecialchars($database) . '">';
                    echo '<input type="hidden" name="table_name_to_delete" value="' . htmlspecialchars($tableName) . '">';
                    echo '<button type="submit" name="delete_table" class="btn btn-danger btn-sm">Hapus</button>';
                    echo '</form>';
                    echo '</td>';
                    echo '</tr>';
                }
                echo '</tbody></table>';
                echo '</div></div></div>'; // table-responsive, card-body, card
            } else {
                echo '<div class="alert alert-info" role="alert">Tidak ada tabel di database ini.</div>';
            }
        } // Akhir dari else utama

        $conn->close();
    } // Akhir dari if koneksi berhasil
    ?>
</div>
<script>
    // Fungsi untuk menyembunyikan alert secara otomatis
    function autoHideAlerts() {
        // Ambil semua elemen alert
        const alerts = document.querySelectorAll('.alert');

        alerts.forEach(alert => {
            // Gunakan setTimeout untuk menjalankan fungsi setelah 3000ms (3 detik)
            setTimeout(() => {
                // Tambahkan kelas "hide" dan "fade" untuk efek transisi
                alert.classList.add('fade', 'show');

                // Gunakan JavaScript Bootstrap untuk menutup alert
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }, 3000);
        });
    }

    // Panggil fungsi saat dokumen selesai dimuat
    document.addEventListener('DOMContentLoaded', autoHideAlerts);
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>
</body>
</html>